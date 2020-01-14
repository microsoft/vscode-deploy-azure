import { RestClient } from "../clients/restClient";
import { UrlBasedRequestPrepareOptions } from 'ms-rest';
import { SodiumLibHelper } from "./sodium/SodiumLibHelper";
import { RequestOptions } from "http";


class GitHubSecretKey {
    key_id: string;
    key: string;
}

export class GitHubProvider {
    // private gitHubPatToken: string;
    private static GitHubUrl = 'https://github.com/';
    private static SSHGitHubUrl = 'git@github.com:';

    // constructor(gitHubPat: string) {
    //     this.gitHubPatToken = gitHubPat;
    // }

    public static isGitHubUrl(remoteUrl: string): boolean {
        return remoteUrl.startsWith(GitHubProvider.GitHubUrl) || remoteUrl.startsWith(GitHubProvider.SSHGitHubUrl);
    }

    public static getRepositoryIdFromUrl(remoteUrl: string): string {
        // Is SSH based URL
        if (remoteUrl.startsWith(GitHubProvider.SSHGitHubUrl)) {
            return remoteUrl.substring(GitHubProvider.SSHGitHubUrl.length);
        }

        let endCount: number = remoteUrl.indexOf('.git');
        if (endCount < 0) {
            endCount = remoteUrl.length;
        }

        return remoteUrl.substring(GitHubProvider.GitHubUrl.length, endCount);
    }

    public static getFormattedRemoteUrl(remoteUrl: string): string {
        // Is SSH based URL
        if (remoteUrl.startsWith(GitHubProvider.SSHGitHubUrl)) {
            return `https://github.com/${remoteUrl.substring(GitHubProvider.SSHGitHubUrl.length)}`;
        }

        return remoteUrl;
    }

    public static getFormattedGitHubApiUrlBase(remoteUrl: string): string {
        let params = remoteUrl.split('/')
        let repoName: string = "";
        let accountName: string = "";
        let accountNext = false, accountDone = false, repoDone = false;
        for(let item of params) {
            if(accountDone && !repoDone) {
                repoName = item;
                repoDone = true;
            }
            
            if(accountNext && !accountDone) {
                accountName = item;
                accountDone = true;
            }

            if(item.toLowerCase() == "github.com") {
                accountNext = true;
            }
        }

        // If you're trying to create a repository with name SampleRepo.git, it'll be renamed to SampleRepo by Github
        if(repoName.endsWith(".git")) {
            repoName = repoName.substr(0, repoName.length - 4)
        }
        return `https://api.github.com/repos/${accountName}/${repoName}`;
    }

    public static async getGitHubSecretKey(remoteUrl: string, patToken: string) : Promise<GitHubSecretKey> {
        let request = <UrlBasedRequestPrepareOptions> {
                url: GitHubProvider.getFormattedGitHubApiUrlBase(remoteUrl) + "/actions/secrets/public-key",
                method: 'GET',
                headers: {
                    "User-Agent": "vscode",
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + patToken 
                },
                serializationMapper: null, 
                deserializationMapper: null
            }
        let restClient = new RestClient();
        let result = {} as GitHubSecretKey;
        try {
            let responseBody: GitHubSecretKey = (await restClient.sendRequest(request)) as GitHubSecretKey;
            result = responseBody
        } catch (error) {
            console.log(error)
            result = null;
        }
        return result;
    }

    public static async setGithubSecret(remoteUrl: string, key_id: string, encrypted_secret: string, patToken: string): Promise<any> {
        let restClient = new RestClient();
        let request = <UrlBasedRequestPrepareOptions>{
            url: GitHubProvider.getFormattedGitHubApiUrlBase(remoteUrl) + "/actions/secrets/AZURE_CREDENTIALS",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + patToken 
            },
            method: "PUT",
            deserializationMapper: null,
            serializationMapper: null,
            body: {
                "encrypted_value": encrypted_secret,
                "key_id": key_id
            }
        }
        let result = null;
        try {
            let response = await restClient.sendRequest(request);
            result = response
        } catch (error) {
            throw error;
        }GitHubProvider
        return result;
    }

    public static async createGithubSecret(body: string, patToken: string, remoteUrl: string): Promise<boolean> {
        let secretKeyObject: GitHubSecretKey = await GitHubProvider.getGitHubSecretKey(remoteUrl, patToken);
        let sodiumObj = new SodiumLibHelper(secretKeyObject.key);
        let encryptedText = sodiumObj.encrypt(body);
        let setSecret = await GitHubProvider.setGithubSecret(remoteUrl, secretKeyObject.key_id, encryptedText, patToken);
        return !!setSecret
    }
}
