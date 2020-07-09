import { GithubClient } from "../../clients/github/githubClient";
import { generateGitHubRepository } from "../../helper/commonHelper";

const uuid = require('uuid/v4');

var expect = require('chai').expect;
var nock = require('nock');

let PAT = "cc42068020540d4b31cdf89982fae9b2d536987f";
let org = "Organization";
let localPath = "some local path";
let githubClient = new GithubClient(PAT, localPath);
let uniqueId = uuid().substr(0, 5);
let repoName = "Repository";

var responseOnFailure = {
    "message": "Repository creation failed.",
    "errors": [
        {
            "resource": "Repository",
            "code": "custom",
            "field": "name",
            "message": "name already exists on this account"
        }
    ],
};

describe('Testing generateGithubRepository()', function () {
    this.timeout(500000);
    before(function () {
        var responseOnSuccess = {
            "id": 278008782,
            "name": repoName,
            "private": true,
            "owner": {
                "login": org,
                "id": 67440137
            },
            "html_url": "https://github.com/" + org + "/" + repoName,
            "description": "Repo created from VScode extension 'Deploy to Azure'"
        };
        nock('https://api.github.com')
            .post('/orgs/' + org + '/repos')
            .reply(200, responseOnSuccess);
    });

    it('Creates new repository with the same name as local name', function (done) {
        generateGitHubRepository(org, localPath, githubClient).then((repo) => {
            expect(repo).to.have.property('name');
            expect(repo).to.have.property('id');
            expect(repo).to.have.property('html_url');
            expect(repo).to.have.property('owner');
            expect(repo.name).to.deep.equal(repoName);
            expect(repo.description).to.deep.equal("Repo created from VScode extension 'Deploy to Azure'");
            done();
        });
    });

    before(function () {
        var responseOnSuccess = {
            "id": 278008782,
            "name": repoName + "_" + org,
            "private": true,
            "owner": {
                "login": org,
                "id": 67440137
            },
            "html_url": "https://github.com/" + org + "/" + repoName + "_" + org,
            "description": "Repo created from VScode extension 'Deploy to Azure'"
        };
        nock('https://api.github.com')
            .post('/orgs/' + org + '/repos')
            .reply(422, responseOnFailure)
            .post('/orgs/' + org + '/repos')
            .reply(200, responseOnSuccess);
    });

    it('Creates new repository with the name = "local name + org name"', function (done) {
        generateGitHubRepository(org, localPath, githubClient).then((repo) => {
            expect(repo).to.have.property('name');
            expect(repo).to.have.property('id');
            expect(repo).to.have.property('html_url');
            expect(repo).to.have.property('owner');
            expect(repo.name).to.deep.equal(repoName + "_" + org);
            expect(repo.description).to.deep.equal("Repo created from VScode extension 'Deploy to Azure'");
            done();
        });
    });

    before(function () {
        var responseOnSuccess = {
            "id": 278008782,
            "name": repoName + "_" + org + "_" + uniqueId,
            "private": true,
            "owner": {
                "login": org,
                "id": 67440137
            },
            "html_url": "https://github.com/" + org + "/" + repoName + "_" + org + "_" + uniqueId,
            "description": "Repo created from VScode extension 'Deploy to Azure'"
        };
        nock('https://api.github.com')
            .post('/orgs/' + org + '/repos')
            .reply(422, responseOnFailure)
            .post('/orgs/' + org + '/repos')
            .reply(422, responseOnFailure)
            .post('/orgs/' + org + '/repos')
            .reply(200, responseOnSuccess);
    });

    it('Creates new repository with the name = "local name + org name + uuid"', function (done) {
        generateGitHubRepository(org, localPath, githubClient).then((repo) => {
            expect(repo).to.have.property('name');
            expect(repo).to.have.property('id');
            expect(repo).to.have.property('html_url');
            expect(repo).to.have.property('owner');
            expect(repo.name).to.deep.equal(repoName + "_" + org + "_" + uniqueId);
            expect(repo.description).to.deep.equal("Repo created from VScode extension 'Deploy to Azure'");
            done();
        });
    });

});