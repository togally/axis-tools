import { createHash, randomBytes } from 'node:crypto';
import { copyFile, mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
export const journalRelativePath = '.axis/project-init.journal.json';
const defaultHooks = {
    copyFile,
    fsyncDirectory: async (directory) => {
        const handle = await open(directory, 'r');
        try {
            await handle.sync();
        }
        finally {
            await handle.close();
        }
    },
    fsyncFile: async (filePath) => {
        const handle = await open(filePath, 'r+');
        try {
            await handle.sync();
        }
        finally {
            await handle.close();
        }
    },
    rename,
    rm: async (target, options) => rm(target, options),
    writeFile: async (filePath, content) => writeFile(filePath, content, 'utf8'),
};
function hashText(text) {
    return createHash('sha256').update(text, 'utf8').digest('hex');
}
function absoluteRepoPath(repo, relativePath) {
    if (path.isAbsolute(relativePath) || relativePath.split(/[\\/]+/).includes('..')) {
        throw new Error(`transaction path must be relative to repo: ${relativePath}`);
    }
    const absolute = path.resolve(repo, relativePath);
    const prefix = repo.endsWith(path.sep) ? repo : `${repo}${path.sep}`;
    if (!absolute.startsWith(prefix))
        throw new Error(`transaction path must be inside repo: ${relativePath}`);
    return absolute;
}
async function exists(filePath) {
    try {
        await readFile(filePath, 'utf8');
        return true;
    }
    catch (error) {
        if (error.code === 'ENOENT')
            return false;
        throw error;
    }
}
async function readOptional(filePath) {
    try {
        return await readFile(filePath, 'utf8');
    }
    catch (error) {
        if (error.code === 'ENOENT')
            return null;
        throw error;
    }
}
async function syncDirectoryFor(filePath, hooks) {
    await hooks.fsyncDirectory(path.dirname(filePath));
}
async function persistJournal(journalPath, journal, hooks) {
    const tempPath = `${journalPath}.tmp-${journal.transaction_id}`;
    await hooks.writeFile(tempPath, `${JSON.stringify(journal, null, 2)}\n`);
    await hooks.fsyncFile(tempPath);
    await hooks.rename(tempPath, journalPath);
    await syncDirectoryFor(journalPath, hooks);
}
function journalEntry(repo, transactionId, index, file) {
    const absolutePath = absoluteRepoPath(repo, file.path);
    const txDir = path.join(repo, '.axis', '.project-init-tx', transactionId);
    const backupPath = path.join(txDir, `${index}.bak`);
    const tempPath = path.join(txDir, `${index}.tmp`);
    const originalPresent = file.originalText !== null;
    const nextPresent = file.nextText !== null;
    return {
        absolutePath,
        backupPath,
        tempPath,
        entry: {
            role: file.role,
            path: file.path,
            original: {
                state: originalPresent ? 'present' : 'absent',
                sha256: originalPresent ? hashText(file.originalText) : null,
                backup: originalPresent ? path.relative(repo, backupPath).split(path.sep).join('/') : null,
            },
            next: {
                state: nextPresent ? 'present' : 'absent',
                sha256: nextPresent ? hashText(file.nextText) : null,
            },
            temp: nextPresent ? path.relative(repo, tempPath).split(path.sep).join('/') : null,
        },
    };
}
async function restoreOriginal(repo, journal, hooks) {
    for (const entry of journal.files) {
        const target = absoluteRepoPath(repo, entry.path);
        if (entry.original.state === 'absent') {
            await hooks.rm(target, { force: true });
        }
        else if (entry.original.backup) {
            await hooks.copyFile(absoluteRepoPath(repo, entry.original.backup), target);
        }
        await syncDirectoryFor(target, hooks);
    }
}
async function verifyNext(repo, journal) {
    for (const entry of journal.files) {
        const text = await readOptional(absoluteRepoPath(repo, entry.path));
        if (entry.next.state === 'absent') {
            if (text !== null)
                throw new Error(`committed transaction target is not absent: ${entry.path}`);
            continue;
        }
        if (text === null || hashText(text) !== entry.next.sha256) {
            throw new Error(`committed transaction target hash mismatch: ${entry.path}`);
        }
    }
}
async function cleanup(repo, journalPath, journal, hooks) {
    const txDir = path.join(repo, '.axis', '.project-init-tx', journal.transaction_id);
    await hooks.rm(txDir, { recursive: true, force: true });
    await syncDirectoryFor(txDir, hooks);
    await hooks.rm(journalPath, { force: true });
    await syncDirectoryFor(journalPath, hooks);
}
export async function applyTransaction(options) {
    const hooks = { ...defaultHooks, ...(options.hooks ?? {}) };
    const repo = path.resolve(options.repo);
    const transactionId = `${Date.now().toString(36)}-${randomBytes(6).toString('hex')}`;
    const journalPath = path.join(repo, journalRelativePath);
    const txDir = path.join(repo, '.axis', '.project-init-tx', transactionId);
    await mkdir(txDir, { recursive: true });
    const entries = [];
    const paths = [];
    for (const file of options.files) {
        const descriptor = journalEntry(repo, transactionId, paths.length, file);
        paths.push({ file, absolutePath: descriptor.absolutePath, backupPath: descriptor.backupPath, tempPath: descriptor.tempPath });
        entries.push(descriptor.entry);
    }
    for (const item of paths) {
        const current = await readOptional(item.absolutePath);
        if (current !== item.file.originalText)
            throw new Error(`stale project-init target: ${item.file.path}`);
    }
    await options.validateBefore?.();
    for (const item of paths) {
        await mkdir(path.dirname(item.backupPath), { recursive: true });
        if (item.file.originalText !== null) {
            await hooks.writeFile(item.backupPath, item.file.originalText);
            await hooks.fsyncFile(item.backupPath);
        }
        if (item.file.nextText !== null) {
            await mkdir(path.dirname(item.absolutePath), { recursive: true });
            await hooks.writeFile(item.tempPath, item.file.nextText);
            await hooks.fsyncFile(item.tempPath);
        }
        await syncDirectoryFor(item.backupPath, hooks);
        await syncDirectoryFor(item.absolutePath, hooks);
    }
    const journal = {
        schema: 'axis.project_init_journal',
        schema_version: 1,
        transaction_id: transactionId,
        state: 'prepared',
        replaced_count: 0,
        files: entries,
    };
    await persistJournal(journalPath, journal, hooks);
    try {
        journal.state = 'replacing';
        await persistJournal(journalPath, journal, hooks);
        for (const [index, item] of paths.entries()) {
            if (item.file.nextText === null) {
                await hooks.rm(item.absolutePath, { force: true });
            }
            else {
                await hooks.rename(item.tempPath, item.absolutePath);
            }
            await syncDirectoryFor(item.absolutePath, hooks);
            journal.replaced_count = index + 1;
            await persistJournal(journalPath, journal, hooks);
        }
        await options.validateAfter?.();
        journal.state = 'committed';
        await persistJournal(journalPath, journal, hooks);
        await cleanup(repo, journalPath, journal, hooks);
    }
    catch (error) {
        try {
            await restoreOriginal(repo, journal, hooks);
            await cleanup(repo, journalPath, journal, hooks);
        }
        catch (rollbackError) {
            throw new Error(`project-init rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
        }
        throw error;
    }
}
export async function recoverTransaction(repoInput) {
    const repo = path.resolve(repoInput);
    const journalPath = path.join(repo, journalRelativePath);
    const text = await readOptional(journalPath);
    if (text === null)
        return;
    let journal;
    try {
        journal = JSON.parse(text);
    }
    catch {
        throw new Error('invalid project-init transaction journal');
    }
    const hooks = defaultHooks;
    if (journal.state === 'committed') {
        await verifyNext(repo, journal);
    }
    else {
        await restoreOriginal(repo, journal, hooks);
    }
    await cleanup(repo, journalPath, journal, hooks);
}
