import * as _ from 'lodash';
import { GithubClient } from "../../../clients/github/githubClient";

var expect = require('chai').expect;
var nock = require('nock');

let org = "Organization";
let repoName = "Repository";
let githubClient = new GithubClient("PAT", "repoUrl");

var orgList = [
    {
        "login": "SampleOrganizationA",
        "id": 66720950,
        "url": "https://api.github.com/orgs/SampleOrganizationA",
        "repos_url": "https://api.github.com/orgs/SampleOrganizationA/repos"
    },
    {
        "login": "SampleOrganizationB",
        "id": 67440137,
        "url": "https://api.github.com/orgs/SampleOrganizationB",
        "repos_url": "https://api.github.com/orgs/SampleOrganizationB/repos",
    },
    {
        "login": "SampleOrganizationC",
        "id": 67453753,
        "url": "https://api.github.com/orgs/SampleOrganizationC",
        "repos_url": "https://api.github.com/orgs/SampleOrganizationC/repos"
    }];

var userInfo = {
    "login": "username",
    "id": 66721313,
    "url": "https://api.github.com/users/username",
    "repos_url": "https://api.github.com/users/username/repos"
}

var repoCreationResponseOnSuccess = {
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

var repoCreationResponseOnFailure = {
    "message": "Resource protected by organization SAML enforcement. You must grant your PAT access to this organization",
    "documentation_url": "some url"
};

describe('# Testing listOrganizations() ', function () {

    context('User is a member of organizations(s)', function () {
        it('should return a list of organizations', function (done) {
            nock('https://api.github.com')
                .get('/user/orgs')
                .reply(200, orgList)
                .get('/user')
                .reply(200, userInfo);
            githubClient.listOrganizations(true).then((orgs) => {
                expect(Array.isArray(orgs)).to.equal(true);
                expect(orgs.length).to.equal(4);
                orgs.forEach((org) => {
                    expect(org).to.have.property('login');
                    expect(org).to.have.property('id');
                    expect(org).to.have.property('url');
                });
                done();
            });
        });
    });

    context('User is not a member of any organization', function () {
        it('Should return an empty list of organization', function (done) {
            nock('https://api.github.com')
                .get('/user/orgs')
                .reply(200, [])
                .get('/user')
                .reply(200, userInfo);
            githubClient.listOrganizations(true).then((orgs) => {
                expect(Array.isArray(orgs)).to.equal(true);
                expect(orgs.length).to.equal(1);
                done();
            });
        });
    });
});

describe('# Testing createGitHubRepo()', function () {

    context('Given repository name is unique', function () {
        it('Should create a new repository', function (done) {
            nock('https://api.github.com')
                .post('/orgs/' + org + '/repos', _.matches({ name: repoName }))
                .reply(200, repoCreationResponseOnSuccess);
            githubClient.createGithubRepo(org, repoName).then((repo) => {
                expect(repo).to.not.deep.equal(null);
                done();
            });
        });
    });

    context('Repository creation fails due to existence of repository of same name within the organization', function () {
        it('Should return null', function (done) {
            nock('https://api.github.com')
                .post('/orgs/' + org + '/repos')
                .reply(422, repoCreationResponseOnFailure);
            githubClient.createGithubRepo(org, repoName).then((repo) => {
                expect(repo).to.equal(null);
                done();
            });
        });
    });

    context('Repository creation fails due to some other reason', function () {
        it('Should throw error', function (done) {
            nock('https://api.github.com')
                .post('/orgs/' + org + '/repos')
                .reply(400, repoCreationResponseOnFailure);
            githubClient.createGithubRepo(org, repoName).then(function () {
                done();
            }).catch(err => {
                expect(err).to.equal(err);
                done();
            });
        })
    });

});
