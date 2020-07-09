//using Nock
import { GithubClient } from "../../clients/github/githubClient";

var expect = require('chai').expect;
var nock = require('nock');

let PAT = "1a6365adfa0b2f66888e309d3f126f2d554a6806";
let org = "JadedJune";
let repoName = "Horizon";

let githubClient = new GithubClient(PAT, "repoUrl");

describe('Testing listOrganizations() -- using Nock', function () {
    this.timeout(10000);
    before(function () {
        var orgList = [
            {
                "login": "SampleOrganizationA",
                "id": 66720950,
                "node_id": "MDEyOk9yZ2FuaXphdGlvbjY2NzIwOTUw",
                "url": "https://api.github.com/orgs/SampleOrganizationA",
                "repos_url": "https://api.github.com/orgs/SampleOrganizationA/repos"
            },
            {
                "login": "JadedJune",
                "id": 67440137,
                "node_id": "MDEyOk9yZ2FuaXphdGlvbjY3NDQwMTM3",
                "url": "https://api.github.com/orgs/JadedJune",
                "repos_url": "https://api.github.com/orgs/JadedJune/repos",
                "avatar_url": "https://avatars3.githubusercontent.com/u/67440137?v=4"
            },
            {
                "login": "SampleOrganizationB",
                "id": 67453753,
                "node_id": "MDEyOk9yZ2FuaXphdGlvbjY3NDUzNzUz",
                "url": "https://api.github.com/orgs/SampleOrganizationB",
                "repos_url": "https://api.github.com/orgs/SampleOrganizationB/repos"
            }];

        nock('https://api.github.com')
            .get('/user/orgs')
            .reply(200, orgList);
    });

    it('returns list of organizations', function (done) {

        githubClient.listOrganizations().then((orgs) => {
            expect(Array.isArray(orgs)).to.equal(true);
            expect(orgs).to.have.length.above(1);
            orgs.forEach((org) => {
                expect(org).to.have.property('login');
                expect(org).to.have.property('id');
                expect(org).to.have.property('url');
            });
            done();
        });
    });
    before(function () {
        var orgList = [];

        nock('https://api.github.com')
            .get('/user/orgs')
            .reply(200, orgList);
    });

    it('returns empty list of organizations', function (done) {

        githubClient.listOrganizations().then((orgs) => {
            expect(Array.isArray(orgs)).to.equal(true);
            expect(orgs).to.have.length.above(1);
            done();
        });
    });
});

describe('Testing createGitHubRepo', function () {
    this.timeout(10000);
    before(function () {
        var response = {
            "id": 278008782,
            "node_id": "MDEwOlJlcG9zaXRvcnkyNzgwMDg3ODI=",
            "name": repoName,
            "private": true,
            "owner": {
                "login": org,
                "id": 67440137
            },
            "html_url": "https://github.com/JadedJune/Jaded6502",
            "description": "Repo created from VScode extension 'Deploy to Azure'"
        };

        nock('https://api.github.com')
            .post('/orgs/JadedJune/repos')
            .reply(200, response);
    });

    it('creates a new repo', function (done) {

        githubClient.createGithubRepo(org, repoName).then((repo) => {
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
            .post('/orgs/JadedJune/repos')
            .reply(422, response);
    });

    it('Returns null when repository creation fails due to existence of repository of same name within the organization', function (done) {

        githubClient.createGithubRepo(org, repoName).then((repo) => {
            expect(repo).to.equal(null);
            done();
        });
    });
});
