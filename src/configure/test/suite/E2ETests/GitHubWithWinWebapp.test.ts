import * as vscode from 'vscode';
import { ControlProvider } from "../../../helper/controlProvider";
import { Messages } from "../../../resources/messages";
// var path = require('path');
// var os = require('os');
// var fs = require('fs');
let sinon = require('sinon');
let chai = require("chai");
let chaiAsPromised = require("chai-as-promised");

chai.use(chaiAsPromised);
//let expect = chai.expect;

const extensionId = "ms-vscode-deploy-azure.azure-deploy";

let subscriptionData = {
    label: "RMDev",
    data: {
        session: {
            userId: "vimimrot@microsoft.com",
            tenantId: "72f988bf-86f1-41af-91ab-2d7cd011db47"
        },
        subscription: {
            id: "/subscriptions/c00d16c7-6c1f-4c03-9be1-6934a4c49682",
            subscriptionId: "c00d16c7-6c1f-4c03-9be1-6934a4c49682",
            displayName: "RMDev",
        }
    },
    description: "c00d16c7-6c1f-4c03-9be1-6934a4c49682"
};

let webappResourceData = {
    label: "vnm-demo",
    data: {
        id: "/subscriptions/c00d16c7-6c1f-4c03-9be1-6934a4c49682/resourceGroups/vnmtestlinux93c8/providers/Microsoft.Web/sites/vnm-demo",
        name: "vnm-demo",
        type: "Microsoft.Web/sites",
        kind: "app"
    }
};

describe('# Should start extension @vscode-deploy-azure ', function () {
    context('Should start extension @vscode-deploy-azure', function () {
        it('should be able to activate the extension', async function () {
            this.timeout(60 * 1000);
            await sleep(2000);
            const extension = vscode.extensions.getExtension(extensionId);
            if (!extension.isActive) {
                chai.expect(extension.activate()).should.be.fulfilled;
            }
        });
    });


    context('Mock - Should configure pipeline @vscode-deploy-azure', function () {

        // before(function () {
        //     this.timeout(0);
        //     var projectPath: string;

        //     var localGitDirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'sample-'));
        //     const gitUrl = "https://github.com/microsoft/devops-project-samples.git";
        //     return LocalGitRepoHelper.GitCloneRepo(gitUrl, localGitDirPath).then(() => {
        //         fs.rmdirSync(path.join(localGitDirPath, ".git"), { recursive: true });
        //         projectPath = path.join(localGitDirPath, "html", "webapp", "Application");
        //         let uri = vscode.Uri.file(projectPath);
        //         return vscode.commands.executeCommand('vscode.openFolder', uri).then((success) => {
        //         }, (err) => {
        //             throw new Error("Unable to open folder: " + projectPath);
        //         });
        //     });
        // });

        it('Mock - configure pipeline @vscode-deploy-azure', function () {
            this.timeout(0);

            let mockGetInput, mockShowQuickPick, mockShowInformationMessage;
            return sleep(5000).then(() => {
                return vscode.extensions.getExtension(extensionId).activate();
            }).then(() => {
                mockGetInput = sinon.stub(ControlProvider.prototype, 'showInputBox');
                mockGetInput.onFirstCall().resolves('bf025851a48bfe18d7b49e7ec7f7bb6c854645d8');

                mockShowQuickPick = sinon.stub(ControlProvider.prototype, 'showQuickPick');
                mockShowQuickPick
                    .onFirstCall().resolves(subscriptionData)
                    .onSecondCall().resolves(webappResourceData);

                mockShowInformationMessage = sinon.stub(ControlProvider.prototype, 'showInformationBox');
                mockShowInformationMessage.onFirstCall().resolves(Messages.discardPipeline);
                return sleep(5000);
            }).then(() => {
                return vscode.commands.executeCommand("configure-cicd-pipeline");
            }).then(() => {
                sinon.assert.calledOnce(mockGetInput);
                sinon.assert.calledTwice(mockShowQuickPick);
                sinon.assert.calledOnce(mockShowInformationMessage);
            });
        });

        after(function () {
            sinon.restore();
        });
    });

    // context('Mock - Should configure pipeline @vscode-deploy-azure', function () {
    //     it('Mock - configure pipeline @vscode-deploy-azure', async function () {
    //         this.timeout(0);
    //         await sleep(5000);
    //         await vscode.extensions.getExtension(extensionId).activate();
    //         //            await sleep(2000);
    //         let mockControlProvider;
    //         mockControlProvider = sinon.createStubInstance(ControlProvider);
    //         mockControlProvider.showInputBox.onFirstCall().resolves('bf025851a48bfe18d7b49e7ec7f7bb6c854645d8');

    //         //            mockShowQuickPick = sinon.stub(ControlProvider.prototype, 'showQuickPick');
    //         mockControlProvider.showQuickPick
    //             .onFirstCall().resolves(subscriptionData)
    //             .onSecondCall().resolves(webappResourceData)
    //             .onThirdCall().resolves("vnm-test2");

    //         //            mockShowInformationMessage = sinon.stub(ControlProvider.prototype, 'showInformationBox');
    //         mockControlProvider.showInformationBox.onFirstCall().resolves(Messages.commitAndPush);
    //         await sleep(2000);
    //         await vscode.commands.executeCommand("configure-cicd-pipeline");
    //         //            await sleep(2000);
    //         expect(mockControlProvider.showInputBox.calledOnce, "showInputBox.calledOnce").to.be.true;
    //         expect(mockControlProvider.showQuickPick.calledThrice, "showQuickPick.calledThrice").to.be.true;
    //         expect(mockControlProvider.showInformationBox.calledOnce, "showInformationBox.calledOnce").to.be.true;

    //     });

    //     after(() => {
    //         sinon.restore();
    //     })
    // });



});

// afterEach(() => {
//     // Restore the default sandbox here
//     sinon.restore();
// });

async function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
