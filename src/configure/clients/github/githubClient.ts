import { UrlBasedRequestPrepareOptions } from 'ms-rest';
import { SimpleGit } from 'simple-git/promise';
import { stringCompareFunction } from "../../helper/commonHelper";
import { GitHubProvider } from "../../helper/gitHubHelper";
import { SodiumLibHelper } from "../../helper/sodium/SodiumLibHelper";
import { GitHubOrganization, GitHubRepo } from '../../model/models';
import { Messages } from '../../resources/messages';
import { RestClient } from "../restClient";
const uuid = require('uuid/v4');

// Simple-git without promise 
//const simpleGit = require('simple-git')();

const simpleGit = require('simple-git');
// Shelljs package for running shell tasks optional
const shellJs = require('shelljs');
// Simple Git with Promise for handling success and failure
const simpleGitPromise = require('simple-git/promise')();

const UserAgent = "deploy-to-azure-vscode";

export class GithubClient {

    private patToken: string;
    private url: string;
    private listOrgPromise: Promise<void | GitHubOrganization[]>;


    constructor(patToken: string, remoteUrl: string) {
        this.patToken = patToken;
        this.url = remoteUrl;
        this.listOrgPromise = this.listOrganizations(this.patToken);
    }

    public createGithubRepo(orgName: string, repoName: string): Promise<void | GitHubRepo> {
        let restClient =new RestClient();
        try{
            return restClient.sendRequest(<UrlBasedRequestPrepareOptions>{
                url: "https://api.github.com/orgs/" + orgName + "/repos",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + this.patToken,
                    "User-Agent": UserAgent
                },
                method: 'POST',
                body: {
                    "name": repoName,
                    "description": "Repo created from VScode",
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
                }).catch(error=>{
                        console.log("inside inner catch");
                        return null;
                });
        }
        catch(error){
            //need to check the type of error - not sure
            return null;
        }
    }

    public async listOrganizations(PATtoken: string, forceRefresh?: boolean): Promise<void | GitHubOrganization[]> {
        if (!this.listOrgPromise || forceRefresh) {
            let restClient = new RestClient();
            this.listOrgPromise = restClient.sendRequest(<UrlBasedRequestPrepareOptions>{
                url: "https://api.github.com/user/orgs",
                method: 'GET',
                headers: {
                    "Authorization": "Bearer " + PATtoken,
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

    public async getRepoList(orgName: string): Promise<GitHubRepo[]>{
        let restClient = new RestClient();
        return restClient.sendRequest(<UrlBasedRequestPrepareOptions>{
            url: "https://api.github.com/orgs/" + orgName + "/repos",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + this.patToken,
                "User-Agent": UserAgent
            },
            method: 'GET',
            deserializationMapper: null,
            serializationMapper: null
        })
            .then((repoList: GitHubRepo[]) => {
                return repoList;
            });
    }

    public async generateGitHubRepositoryName(orgName: string, localPath: string): Promise<GitHubRepo | void>{
        //console.log(localPath);
        let folderName = localPath.substring(localPath.lastIndexOf("\\")+1);
        //console.log(folderName);
        folderName = folderName.replace("*","-");    //need to include all the special characters here
        //console.log(folderName);
        let repoName = folderName;
        let repoDetails = await this.createGithubRepo(orgName, repoName) as unknown as GitHubRepo | void;
        if(repoDetails){
            console.log("repoName : "+repoDetails.name);
            return repoDetails; 
        }
        repoName = orgName+"-"+folderName;
        console.log(repoName);
        repoDetails = await this.createGithubRepo(orgName, repoName) as unknown as GitHubRepo | void;
        console.log(repoDetails);
        if(repoDetails){
            return repoDetails; 
        }
        console.log("Addidng unique id");
        return await this.createGithubRepo(orgName, repoName+"-"+uuid().substr(0,5));   //need to add proper Uiid or goid
    }

    public async pushFilesIntoGHrepo(repoName: string, orgName: string, localPath: string){
        const git: SimpleGit = simpleGit();
        try {
            await simpleGit.init().catch(ignoreError);
        }
        catch (e) { 
            console.log("error occured inside try block");
        }
        function ignoreError () {
            console.log("error occured during initialization");
        }
        
        // change current directory to repo directory in local
        shellJs.cd(localPath);
        const repo = 'Vscode-testing';
        const userName = 'Juhi004';
        const password = '******';
        const gitHubUrl = `https://${userName}:${password}@github.com/${userName}/${repo}`;
        console.log("github URL: "+ gitHubUrl);
        git.addConfig('user.email','juhiagarwalsy@gmail.com');
        git.addConfig('user.name','Juhi Agarwal');
        simpleGitPromise.addRemote('origin',gitHubUrl);
        simpleGitPromise.add('.')
            .then(
                (addSuccess) => {
                console.log(addSuccess);
            }, (failedAdd) => {
                console.log('adding files failed');
            });
        simpleGitPromise.commit('Intial commit by simplegit from Vscode')
        .then(
            (successCommit) => {
                console.log(successCommit);
            }, (failed) => {
                console.log('failed commmit');
        });
        simpleGitPromise.push('origin','master')
            .then((success) => {
                console.log('repo successfully pushed');
            },(failed)=> {
                console.log('repo push failed');
        });
        
    }

    //no use of this function
    public async validateRepoName(name: string, repoList: GitHubRepo[]): Promise < string > {
        let repoName = name.trim();
        let existingRepos = repoList.filter((repo) => repo.name === name);
        if(!existingRepos || existingRepos.length > 0){
            return Promise.resolve(Messages.duplicateGitHubRepoNameErrorMessage);
        }
        if(!repoName){
            return Promise.resolve(Messages.githubRepoEmptyNameErrorMessage);
        }
        if(repoName === "."){
            return Promise.resolve(Messages.githubRepoNameReservedMessage);
        }
        return Promise.resolve("");
    }

    public async createOrUpdateGithubSecret(secretName: string, body: string): Promise < void> {
    let secretKeyObject: GitHubSecretKey = await this._getGitHubSecretKey();
    let sodiumObj = new SodiumLibHelper(secretKeyObject.key);
    let encryptedBytes: Uint8Array = sodiumObj.encrypt(body);
    let encryptedBytesAsString: string = SodiumLibHelper.convertUint8ArrayToString(encryptedBytes);
    let encryptedEncodedText = SodiumLibHelper.encodeToBase64(encryptedBytesAsString);
    await this._setGithubSecret(secretName, secretKeyObject.key_id, encryptedEncodedText);
}

    private async _getGitHubSecretKey() : Promise < GitHubSecretKey > {
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
    return(await restClient.sendRequest(request)) as GitHubSecretKey;
}

    private async _setGithubSecret(secretName: string, key_id: string, encrypted_secret: string): Promise < void> {
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

interface GitHubSecretKey {
    key_id: string;
    key: string;
}