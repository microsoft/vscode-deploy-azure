import * as vscode from 'vscode';
import { TestConstants } from "../testConstants";
import { TestMocks } from '../testMocks';

var path = require('path');
var fs = require('fs');
let sinon = require('sinon');
let chai = require("chai");
let chaiAsPromised = require("chai-as-promised");

chai.use(chaiAsPromised);
let expect = chai.expect;

describe('# Configure Pipeline for Static Website on Windows AppSvc @vscode-deploy-azure ', function () {
    context('Should start extension @vscode-deploy-azure', function () {
        it('should be able to activate the extension', async function () {
            this.timeout(2000);
            const extension = vscode.extensions.getExtension(TestConstants.extensionId);
            if (!extension.isActive) {
                expect(extension.activate()).should.be.fulfilled;
            }
        });
    });

    context('Should configure pipeline for Static Website on Windows AppSvc', function () {
        let workflowFilePath: string;
        before(function () {
            this.timeout(5000);
            workflowFilePath = path.join(vscode.workspace.workspaceFolders[0].uri.path, ".github/workflows/workflow.yml");
            if (fs.existsSync(workflowFilePath)) {
                fs.unlinkSync(workflowFilePath);
            }
        });

        it('configure pipeline @vscode-deploy-azure', function () {
            this.timeout(0);
            var mocks = new TestMocks();
            return vscode.extensions.getExtension(TestConstants.extensionId).activate()
                .then(() => {

                    mocks.mockCommonMethodsOrProperties();
                    mocks.mockGetAppServices_Windows();
                    mocks.mockIsScmTypeSet();
                    mocks.mockPublishProfile();
                    mocks.mockSettingSecret();
                    mocks.mockShowInputBox();
                    mocks.mockShowQuickPick();
                    mocks.mockShowInformationMessage();
                    return vscode.commands.executeCommand("configure-cicd-pipeline");
                }).then(() => {
                    mocks.assertMocks();
                    const buf1 = fs.readFileSync(path.join(__dirname, "../testFixtures/workflows", "Static_Windows_WebApp_Workflow.yml"));
                    const buf2 = fs.readFileSync(workflowFilePath);
                    expect(Buffer.compare(buf1, buf2)).to.equal(0);
                });
        });

        after(function () {
            sinon.restore();
        });
    });
});