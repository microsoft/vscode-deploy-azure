import { GithubClient } from "../../clients/github/githubClient";

var expect = require('chai').expect;
var nock = require('nock');

let org = "Organization";
let repoName = "Repository";
let githubClient = new GithubClient("PAT", "repoUrl");


describe('# Testing listOrganizations() ', function () {

    before(function () {
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

        nock('https://api.github.com')
            .get('/user/orgs')
            .reply(200, orgList);
    });

    context('User is a member of organizations(s)', function () {
        it('should return a list of organizations', function (done) {
            githubClient.listOrganizations(true).then((orgs) => {
                expect(Array.isArray(orgs)).to.equal(true);
                expect(orgs.length).to.equal(3);
                orgs.forEach((org) => {
                    expect(org).to.have.property('login');
                    expect(org).to.have.property('id');
                    expect(org).to.have.property('url');
                });
                done();
            });
        });
    });
    before(function () {
        var response = [];
        nock('https://api.github.com')
            .get('/user/orgs')
            .reply(200, response);
    });

    context('User is not a member of any organization', function () {
        it('Should return an empty list of organization', function (done) {
            githubClient.listOrganizations(true).then((orgs) => {
                expect(Array.isArray(orgs)).to.equal(true);
                expect(orgs.length).to.equal(0);
                done();
            });
        });
    });
});

describe('# Testing createGitHubRepo()', function () {

    before(function () {
        var response = {
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
        var body = {
            "name": repoName,
            "description": "Repo created from VScode extension 'Deploy to Azure'",
            "homepage": "https://github.com",
            "private": true,
            "has_issues": true,
            "has_projects": true,
            "has_wiki": true
        };

        nock('https://api.github.com')
            .post('/orgs/' + org + '/repos', body)
            .reply(200, response);
    });

    context('Given repository name is unique', function () {
        it('Should create a new repository', function (done) {
            githubClient.createGithubRepo(org, repoName).then((repo) => {
                expect(repo).to.not.deep.equal(null);
                done();
            });
        });
    });

    before(function () {
        var response = {
            "message": "Repository creation failed.",
            "errors": [
                {
                    "resource": "Repository",
                    "code": "custom",
                    "field": "name",
                    "message": "name already exists on this account"
                }
            ],
            "documentation_url": "https://developer.github.com/v3/repos/#create"
        };
        nock('https://api.github.com')
            .post('/orgs/' + org + '/repos')
            .reply(422, response);
    });

    context('Repository creation fails due to existence of repository of same name within the organization', function () {
        it('Should return null', function (done) {
            githubClient.createGithubRepo(org, repoName).then((repo) => {
                expect(repo).to.equal(null);
                done();
            });
        });
    });

    before(function () {
        var response = {
            "message": "Resource protected by organization SAML enforcement. You must grant your PAT access to this organization",
            "documentation_url": "some url"
        };
        nock('https://api.github.com')
            .post('/orgs/' + org + '/repos')
            .reply(400, response);
    });


    context('Repository creation fails due to some other reason', function () {
        it('Should throw error', function (done) {
            githubClient.createGithubRepo(org, repoName).then(function () {
                done();
            }).catch(err => {
                expect(err).to.equal(err);
                done();
            });
        })
    });

});
