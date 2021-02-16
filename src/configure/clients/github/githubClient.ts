import { UrlBasedRequestPrepareOptions } from 'ms-rest';
import { stringCompareFunction } from "../../helper/commonHelper";
import { GitHubProvider } from "../../helper/gitHubHelper";
import { SodiumLibHelper } from '../../helper/sodium/SodiumLibHelper';
import { GitHubOrganization, GitHubRepo } from '../../model/models';
import { Messages } from '../../resources/messages';
import { WhiteListedError } from '../../utilities/utilities';
import { IUrlBasedRequestPrepareOptions2, RestClient } from "../restClient";

const UserAgent = "deploy-to-azure-vscode";

export class GithubClient {

    private patToken: string;
    private url: string;
    private listOrgPromise: Promise<GitHubOrganization[]>;

    constructor(patToken: string, remoteUrl: string) {
        this.patToken = patToken;
        this.url = remoteUrl;
    }

    public async setRepoUrl(repoUrl: string) {
        this.url = repoUrl;
    }

    public async createOrUpdateGithubSecret(secretName: string, body: string): Promise<void> {
        const secretKeyObject: IGitHubSecretKey = await this._getGitHubSecretKey();
        const sodiumObj = new SodiumLibHelper(secretKeyObject.key);
        const encryptedBytes: Uint8Array = sodiumObj.encrypt(body);
        const encryptedBytesAsString: string = SodiumLibHelper.convertUint8ArrayToString(encryptedBytes);
        const encryptedEncodedText = SodiumLibHelper.encodeToBase64(encryptedBytesAsString);
        await this._setGithubSecret(secretName, secretKeyObject.key_id, encryptedEncodedText);
    }

    public async createGithubRepo(orgName: string, repoName: string, isUserAccount: boolean = false): Promise<GitHubRepo> {
        const Url = isUserAccount ? "https://api.github.com/user/repos" : "https://api.github.com/orgs/" + orgName + "/repos";
        return this._sendRequest(<UrlBasedRequestPrepareOptions>{
            url: Url,
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + this.patToken,
                "User-Agent": UserAgent
            },
            method: 'POST',
            body: {
                name: repoName,
                description: "Repo created from VScode extension 'Deploy to Azure'",
                homepage: "https://github.com",
                private: true,
                has_issues: true,
                has_projects: true,
                has_wiki: true
            },
            deserializationMapper: null,
            serializationMapper: null,
        })
            .then((detail: GitHubRepo) => {
                return detail;
            }).catch((error) => {
                if (error.response.statusCode === 422) {
                    return null;
                }
                throw new Error(JSON.parse(error.response.body).message);
            });
    }

    public async listOrganizations(forceRefresh?: boolean): Promise<GitHubOrganization[]> {
        if (!this.listOrgPromise || forceRefresh) {
            this.listOrgPromise = Promise.all([
                this._sendRequest(<UrlBasedRequestPrepareOptions>{
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
                }),
                this._sendRequest(<UrlBasedRequestPrepareOptions>{
                    url: "https://api.github.com/user",
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
            ])
                .then(([organizations, userInfo]) => {
                    (userInfo as GitHubOrganization).isUserAccount = true;
                    return ((organizations as GitHubOrganization[]).concat(userInfo as GitHubOrganization)).sort((org1, org2) => stringCompareFunction(org1.login, org2.login));
                });
        }
        return this.listOrgPromise;
    }

    public async _getGitHubSecretKey(): Promise<IGitHubSecretKey> {
        const request = <UrlBasedRequestPrepareOptions>{
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
        return (await this._sendRequest(request)) as IGitHubSecretKey;
    }

    public async _setGithubSecret(secretName: string, key_id: string, encrypted_secret: string): Promise<void> {
        const request = <UrlBasedRequestPrepareOptions>{
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
                encrypted_value: encrypted_secret,
                key_id: key_id
            }
        };
        await this._sendRequest(request);
    }

    private _sendRequest(request: IUrlBasedRequestPrepareOptions2): Promise<{}> {
        const restClient = new RestClient();
        return restClient.sendRequest({ ...request, returnFullResponseForFailure: true })
            .catch((error) => {
                if (error.response.statusCode === 401 || error.response.statusCode === 403) {
                    throw new WhiteListedError(Messages.GitHubPatInvalid);
                }

                throw error;
            });
    }
}

export interface IGitHubSecretKey {
    key_id: string;
    key: string;
}
