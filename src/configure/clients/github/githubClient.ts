import { UrlBasedRequestPrepareOptions } from 'ms-rest';
import { stringCompareFunction } from "../../helper/commonHelper";
import { GitHubProvider } from "../../helper/gitHubHelper";
import { SodiumLibHelper } from '../../helper/sodium/SodiumLibHelper';
import { telemetryHelper } from '../../helper/telemetryHelper';
import { GitHubOrganization, GitHubRepo } from '../../model/models';
import { TracePoints } from '../../resources/tracePoints';
import { RestClient } from "../restClient";

const UserAgent = "deploy-to-azure-vscode";
const Layer = 'GithubClient';

export class GithubClient {

    private patToken: string;
    private url: string;
    private listOrgPromise: Promise<GitHubOrganization[]>;


    constructor(patToken: string, remoteUrl: string) {
        this.patToken = patToken;
        this.url = remoteUrl;
        this.listOrgPromise = this.listOrganizations();
    }

    public async setRepoUrl(repoUrl: string) {
        this.url = repoUrl;
    }

    public async createOrUpdateGithubSecret(secretName: string, body: string): Promise<void> {
        let secretKeyObject: GitHubSecretKey = await this._getGitHubSecretKey();
        let sodiumObj = new SodiumLibHelper(secretKeyObject.key);
        let encryptedBytes: Uint8Array = sodiumObj.encrypt(body);
        let encryptedBytesAsString: string = SodiumLibHelper.convertUint8ArrayToString(encryptedBytes);
        let encryptedEncodedText = SodiumLibHelper.encodeToBase64(encryptedBytesAsString);
        await this._setGithubSecret(secretName, secretKeyObject.key_id, encryptedEncodedText);
    }

    public async createGithubRepo(orgName: string, repoName: string): Promise<GitHubRepo> {
        let restClient = new RestClient();
        let Url = "https://api.github.com/orgs/" + orgName + "/repos";
        try {
            return restClient.sendRequest(<UrlBasedRequestPrepareOptions>{
                url: Url,
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + this.patToken,
                    "User-Agent": UserAgent
                },
                method: 'POST',
                body: {
                    "name": repoName,
                    "description": "Repo created from VScode extension 'Deploy to Azure'",
                    "homepage": "https://github.com",
                    "private": false,
                    "has_issues": true,
                    "has_projects": true,
                    "has_wiki": true
                },
                deserializationMapper: null,
                serializationMapper: null
            })
                .then((detail: GitHubRepo) => {
                    return detail;
                }).catch(error => {
                    telemetryHelper.logError(Layer, TracePoints.GitHubRepositoryCreationFailed, error);
                    return null;
                });
        }
        catch (error) {
            telemetryHelper.logError(Layer, TracePoints.GitHubRepositoryCreationFailed, error);
            return null;
        }
    }

    public async listOrganizations(forceRefresh?: boolean): Promise<GitHubOrganization[]> {
        if (!this.listOrgPromise || forceRefresh) {
            let restClient = new RestClient();
            this.listOrgPromise = restClient.sendRequest(<UrlBasedRequestPrepareOptions>{
                url: "https://api.github.com/user/orgs",
                method: 'GET',
                headers: {
                    "Authorization": "Bearer " + this.patToken,
                    "User-Agent": UserAgent,
                    "Content-Type": "application/json",
                    "Accept": "*/*"
                },
                deserializationMapper: null,
                serializationMapper: null
            })
                .then((organizations: Array<GitHubOrganization>) => {
                    organizations = organizations.sort((org1, org2) => stringCompareFunction(org1.login, org2.login));
                    return organizations;
                });
        }
        return this.listOrgPromise;
    }

    public async _getGitHubSecretKey(): Promise<GitHubSecretKey> {
        let request = <UrlBasedRequestPrepareOptions>{
            url: GitHubProvider.getFormattedGitHubApiUrlBase(this.url) + "/actions/secrets/public-key",
            method: 'GET',
            headers: {
                "User-Agent": UserAgent,
                "Content-Type": "application/json",
                "Authorization": "Bearer " + this.patToken,
                "Accept": "*/*"
            },
            serializationMapper: null,
            deserializationMapper: null
        };
        let restClient = new RestClient();
        return (await restClient.sendRequest(request)) as GitHubSecretKey;
    }

    public async _setGithubSecret(secretName: string, key_id: string, encrypted_secret: string): Promise<void> {
        let restClient = new RestClient();
        let request = <UrlBasedRequestPrepareOptions>{
            url: GitHubProvider.getFormattedGitHubApiUrlBase(this.url) + "/actions/secrets/" + secretName,
            headers: {
                "User-Agent": UserAgent,
                "Content-Type": "application/json",
                "Authorization": "Bearer " + this.patToken,
                "Accept": "*/*"
            },
            method: "PUT",
            deserializationMapper: null,
            serializationMapper: null,
            body: {
                "encrypted_value": encrypted_secret,
                "key_id": key_id
            }
        };
        await restClient.sendRequest(request);
    }
}

export interface GitHubSecretKey {
    key_id: string;
    key: string;
}
