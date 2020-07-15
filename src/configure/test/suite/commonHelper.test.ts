import { GithubClient } from "../../clients/github/githubClient";
import { generateGitHubRepository } from "../../helper/commonHelper";

const uuid = require('uuid/v4');

var expect = require('chai').expect;
var nock = require('nock');

let org = "Organization";
let localPath = "c:/directory/Repository";
let githubClient = new GithubClient("PAT", localPath);
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

var body1 = {
    "name": repoName,
    "description": "Repo created from VScode extension 'Deploy to Azure'",
    "homepage": "https://github.com",
    "private": true,
    "has_issues": true,
    "has_projects": true,
    "has_wiki": true
};

var body2 = {
    "name": repoName + "_" + org,
    "description": "Repo created from VScode extension 'Deploy to Azure'",
    "homepage": "https://github.com",
    "private": true,
    "has_issues": true,
    "has_projects": true,
    "has_wiki": true
};


var body3 = {
    "name": /Repository_Organization_[a-zA-Z0-9]*/,
    "description": "Repo created from VScode extension 'Deploy to Azure'",
    "homepage": "https://github.com",
    "private": true,
    "has_issues": true,
    "has_projects": true,
    "has_wiki": true
};

describe('# Testing generateGithubRepository()', function () {

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
            .post('/orgs/' + org + '/repos', body1)
            .reply(200, responseOnSuccess);
    });

    context('Local repository name is unique inside selected organization', function () {
        it('Should create a new repository with the same name as local repository name', function (done) {
            generateGitHubRepository(org, localPath, githubClient).then((repo) => {
                expect(repo).to.not.deep.equal(null);
                done();
            });
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
            .post('/orgs/' + org + '/repos', body1)
            .reply(422, responseOnFailure)
            .post('/orgs/' + org + '/repos', body2)
            .reply(200, responseOnSuccess);
    });

    context('Selected organization contains a repository with same name as local repository', function () {
        it('Should create a new repository with the name = "local name + org name"', function (done) {
            generateGitHubRepository(org, localPath, githubClient).then((repo) => {
                expect(repo).to.not.deep.equal(null);
                done();
            });
        });
    });

    before(function () {
        var responseOnSuccess = {
            "id": 278008782,
            "name": repoName + "_" + org + "_" + "3ed45",
            "private": true,
            "owner": {
                "login": org,
                "id": 67440137
            },
            "html_url": "https://github.com/" + org + "/" + repoName + "_" + org + "_" + uniqueId,
            "description": "Repo created from VScode extension 'Deploy to Azure'"
        };
        nock('https://api.github.com')
            .post('/orgs/' + org + '/repos', body1)
            .reply(422, responseOnFailure)
            .post('/orgs/' + org + '/repos', body2)
            .reply(422, responseOnFailure)
            .post('/orgs/' + org + '/repos', body3)
            .reply(200, responseOnSuccess);
    });

    context('Selected organization contains a repository with same name as local repository and another repository with the name - "Local repository name + Organization Name"', function () {
        it('Should create a new repository with the name = "local name + org name + uuid"', function (done) {
            generateGitHubRepository(org, localPath, githubClient).then((repo) => {
                expect(repo).to.not.deep.equal(null);
                done();
            });
        });
    });
});