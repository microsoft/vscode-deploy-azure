import { RestClient } from "../restClient";
import { UrlBasedRequestPrepareOptions } from 'ms-rest';
import { GitHubProvider } from "../../helper/gitHubHelper";
import { SodiumLibHelper } from "../../helper/sodium/SodiumLibHelper";

const UserAgent = "deploy-to-azure-vscode";

export class GithubClient {

    private patToken: string;
    private url: string;

    constructor(patToken: string, remoteUrl: string) {
        this.patToken = patToken;
        this.url = remoteUrl;
    }

    public async createOrUpdateGithubSecret(secretName: string, body: string): Promise<void> {
        let secretKeyObject: GitHubSecretKey = await this._getGitHubSecretKey();
        let sodiumObj = new SodiumLibHelper(secretKeyObject.key);
        let encryptedBytes: Uint8Array = sodiumObj.encrypt(body);
        let encryptedBytesAsString: string = sodiumObj.convertUint8ArrayToString(encryptedBytes);
        let encryptedEncodedText = sodiumObj.encodeToBase64(encryptedBytesAsString);
        await this._setGithubSecret(secretName, secretKeyObject.key_id, encryptedEncodedText);
    }
    
    private async _getGitHubSecretKey() : Promise<GitHubSecretKey> {
        let request = <UrlBasedRequestPrepareOptions> {
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
            }
        let restClient = new RestClient();
        return (await restClient.sendRequest(request)) as GitHubSecretKey;
    }

    private async _setGithubSecret(secretName: string, key_id: string, encrypted_secret: string): Promise<void> {
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
        }
        await restClient.sendRequest(request);
    }
}

interface GitHubSecretKey {
    key_id: string;
    key: string;
}