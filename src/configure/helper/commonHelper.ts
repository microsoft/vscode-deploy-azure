import Q = require('q');
import * as util from 'util';
import * as logger from '../../logger';
import { GithubClient } from '../clients/github/githubClient';
import { GitHubRepo } from '../model/models';
import { Messages } from '../resources/messages';

const uuid = require('uuid/v4');

export async function sleepForMilliSeconds(timeInMs: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve();
        }, timeInMs);
    });
}

export async function generateGitHubRepository(orgName: string, localPath: string, githubClient: GithubClient, isUserAccount: boolean = false): Promise<GitHubRepo> {
    let repoName = localPath.substring(localPath.lastIndexOf("\\") + 1).substring(localPath.lastIndexOf("/") + 1);
    let repoDetails = await githubClient.createGithubRepo(orgName, repoName, isUserAccount) as GitHubRepo;
    // Case : GitHub Repository name is same as the local repo
    if (repoDetails) {
        return repoDetails;
    }
    //Case: Local repository name is not available, therefore organization name has been appended
    repoName = repoName + "_" + orgName;
    repoDetails = await githubClient.createGithubRepo(orgName, repoName, isUserAccount) as GitHubRepo;
    if (repoDetails) {
        return repoDetails;
    }
    //Case: If the above two repository names are not available, uuid is also appended
    return await githubClient.createGithubRepo(orgName, repoName + "_" + uuid().substr(0, 5), isUserAccount);
}

export function generateDevOpsOrganizationName(userName: string, repositoryName: string): string {
    let repositoryNameSuffix = repositoryName.replace("/", "-").trim();
    let organizationName = `${userName}-${repositoryNameSuffix}`;

    // Name cannot start or end with whitespaces, cannot start with '-', cannot contain characters other than a-z|A-Z|0-9
    organizationName = organizationName.trim().replace(/^[-]+/, '').replace(/[^a-zA-Z0-9-]/g, '');
    if (organizationName.length > 50) {
        organizationName = organizationName.substr(0, 50);
    }

    return organizationName;
}

export function generateDevOpsProjectName(repositoryName?: string): string {
    if (!repositoryName) {
        return "AzurePipelines";
    }

    let repoParts = repositoryName.split("/");
    let suffix = repoParts[repoParts.length - 1];
    suffix = suffix.trim();
    // project name cannot end with . or _
    suffix = suffix.replace(/\.[\.]*$/, '').replace(/^_[_]*$/, '');

    let projectName = `AzurePipelines-${suffix}`;
    if (projectName.length > 64) {
        projectName = projectName.substr(0, 64);
    }

    return projectName;
}

export function generateRandomPassword(length: number = 20): string {
    var characters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890!@#%^*()-+";
    var charTypeSize = new Array(26, 26, 10, 10);
    var charTypeStartIndex = new Array(0, 26, 52, 62);
    var password = "";
    for (var x = 0; x < length; x++) {
        var i = Math.floor(Math.random() * charTypeSize[x % 4]);
        password += characters.charAt(i + charTypeStartIndex[x % 4]);
    }
    return password;
}

export function stringCompareFunction(a: string, b: string): number {
    a = a && a.toLowerCase();
    b = b && b.toLowerCase();
    if (a < b) {
        return -1;
    }
    else if (a > b) {
        return 1;
    }
    return 0;
}

export async function executeFunctionWithRetry(
    func: () => Promise<any>,
    retryCount: number = 20,
    retryIntervalTimeInSec: number = 2,
    errorMessage?: string): Promise<any> {
    let internalError = null;
    for (; retryCount > 0; retryCount--) {
        try {
            let result = await func();
            return result;
        }
        catch (error) {
            internalError = error;
            logger.log(JSON.stringify(error));
            await Q.delay((resolve) => { resolve(); }, retryIntervalTimeInSec * 1000);
        }
    }

    throw errorMessage ? errorMessage.concat(util.format(Messages.retryFailedMessage, retryCount, JSON.stringify(internalError))) : util.format(Messages.retryFailedMessage, retryCount, JSON.stringify(internalError));
}