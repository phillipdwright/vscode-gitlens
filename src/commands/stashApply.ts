'use strict';
import { Strings } from '../system';
import { MessageItem, window } from 'vscode';
import { GitService, GitStashCommit } from '../gitService';
import { Command, Commands } from './common';
import { GlyphChars } from '../constants';
import { CommitQuickPickItem, StashListQuickPick } from '../quickPicks';
import { Logger } from '../logger';
import { CommandQuickPickItem } from '../quickPicks';
import { StashCommitNode } from '../views/stashCommitNode';

export interface StashApplyCommandArgs {
    confirm?: boolean;
    deleteAfter?: boolean;
    stashItem?: { stashName: string, message: string };

    goBackCommand?: CommandQuickPickItem;
}

export class StashApplyCommand extends Command {

    constructor(private git: GitService) {
        super(Commands.StashApply);
    }

    async execute(args: StashApplyCommandArgs | StashCommitNode = { confirm: true, deleteAfter: false }) {
        if (!this.git.repoPath) return undefined;

        if (args instanceof StashCommitNode) {
            try {
                const ret = await this.git.stashApply(this.git.repoPath, args.commit.stashName, false);
                args.refreshNode();
                return ret;
            } catch (ex) {
                return this._errorHandling(ex);
            }
        } else {
            args = { ...args };
            if (args.stashItem === undefined || args.stashItem.stashName === undefined) {
                const stash = await this.git.getStashList(this.git.repoPath);
                if (stash === undefined) return window.showInformationMessage(`There are no stashed changes`);

                const currentCommand = new CommandQuickPickItem({
                    label: `go back ${GlyphChars.ArrowBack}`,
                    description: `${Strings.pad(GlyphChars.Dash, 2, 3)} to apply stashed changes`
                }, Commands.StashApply, [args]);

                const pick = await StashListQuickPick.show(this.git, stash, 'apply', args.goBackCommand, currentCommand);
                if (pick === undefined || !(pick instanceof CommitQuickPickItem)) return args.goBackCommand === undefined ? undefined : args.goBackCommand.execute();

                args.goBackCommand = currentCommand;
                args.stashItem = pick.commit as GitStashCommit;
            }

            try {
                if (args.confirm) {
                    const message = args.stashItem.message.length > 80 ? `${args.stashItem.message.substring(0, 80)}${GlyphChars.Ellipsis}` : args.stashItem.message;
                    const result = await window.showWarningMessage(`Apply stashed changes '${message}' to your working tree?`, { title: 'Yes, delete after applying' } as MessageItem, { title: 'Yes' } as MessageItem, { title: 'No', isCloseAffordance: true } as MessageItem);
                    if (result === undefined || result.title === 'No') return args.goBackCommand === undefined ? undefined : args.goBackCommand.execute();

                    args.deleteAfter = result.title !== 'Yes';
                }

                return await this.git.stashApply(this.git.repoPath, args.stashItem.stashName, args.deleteAfter);
            }
            catch (ex) {
                return this._errorHandling(ex);
            }
        }
    }

    private _errorHandling(ex: any) {
        Logger.error(ex, 'StashApplyCommand');
        if (ex.message.includes('Your local changes to the following files would be overwritten by merge')) {
            return window.showErrorMessage(`Unable to apply stash. Your working tree changes would be overwritten.`);
        }
        else {
            return window.showErrorMessage(`Unable to apply stash. See output channel for more details`);
        }
    }
}