import { ResourceListResult } from "azure-arm-resource/lib/resource/models";
import { AppServiceClient } from "../../clients/azure/appServiceClient";
import { GithubClient } from "../../clients/github/githubClient";
import { ControlProvider } from "../../helper/controlProvider";
import { extensionVariables } from "../../model/models";
import * as constants from '../../resources/constants';
import { Messages } from "../../resources/messages";
import { Utilities } from "../../utilities/utilities";
import { TestConstants } from "./testConstants";
import sinon = require("sinon");

export class TestMocks {

    constructor() { }
    private mockGetInputObj;
    private mockShowQuickPickObj;
    private mockShowInformationMessageObj;
    private mockGetAppServiceObj;
    private mockIsScmTypeSetObj;
    private mockPublishProfileObj;
    private mockSettingSecretObj;

    private mockedObjectArray: any[] = [];

    public mockCommonMethodsOrProperties() {
        sinon.stub(extensionVariables, 'azureAccountExtensionApi').value(TestConstants.azureAccountExtensionAPI);
        sinon.stub(Utilities, 'shortGuid').returns(TestConstants.shortGuid);
    }

    public mockGetAppServices_Windows(args: any = ['app,linux', 'app']) {
        this.mockGetAppServiceObj = sinon.stub(AppServiceClient.prototype, 'GetAppServices')
            .withArgs(args)
            .resolves(<ResourceListResult>[TestConstants.windowsWebAppResource]);

        this.mockedObjectArray.push({ mockObject: this.mockGetAppServiceObj, count: 1 });
    }

    public mockIsScmTypeSet() {
        this.mockIsScmTypeSetObj = sinon.stub(AppServiceClient.prototype, 'isScmTypeSet')
            .withArgs(TestConstants.windowsWebAppResource.id)
            .resolves(false);
        this.mockedObjectArray.push({ mockObject: this.mockIsScmTypeSetObj, count: 1 });
    }

    public mockPublishProfile() {
        this.mockPublishProfileObj = sinon.stub(AppServiceClient.prototype, 'getWebAppPublishProfileXml')
            .withArgs(TestConstants.windowsWebAppResource.id)
            .resolves(TestConstants.PublishProfile);
        this.mockedObjectArray.push({ mockObject: this.mockPublishProfileObj, count: 1 });
    }

    public mockSettingSecret() {
        this.mockSettingSecretObj = sinon.stub(GithubClient.prototype, 'createOrUpdateGithubSecret')
            .withArgs(constants.githubSecretNamePrefix + TestConstants.shortGuid, sinon.match.any)
            .resolves();
        this.mockedObjectArray.push({ mockObject: this.mockSettingSecretObj, count: 1 });
    }

    public mockShowInputBox(resolve: string[] = [TestConstants.GithubPAT]) {
        this.mockGetInputObj = sinon.stub(ControlProvider.prototype, 'showInputBox');
        for (var i = 0; i < resolve.length; i++) {
            this.mockGetInputObj.onCall(i).resolves(resolve[i]);
        }
        this.mockedObjectArray.push({ mockObject: this.mockGetInputObj, count: resolve.length });
    }

    public mockShowQuickPick(resolve: any[] = [TestConstants.subscriptionData, TestConstants.windowsWebAppResourceData]) {
        this.mockShowQuickPickObj = sinon.stub(ControlProvider.prototype, 'showQuickPick');
        for (var i = 0; i < resolve.length; i++) {
            this.mockShowQuickPickObj.onCall(i).resolves(resolve[i]);
        }
        this.mockedObjectArray.push({ mockObject: this.mockShowQuickPickObj, count: resolve.length });
    }

    public mockShowInformationMessage(resolve: any[] = [Messages.discardPipeline]) {
        this.mockShowInformationMessageObj = sinon.stub(ControlProvider.prototype, 'showInformationBox');
        for (var i = 0; i < resolve.length; i++) {
            this.mockShowInformationMessageObj.onCall(i).resolves(resolve[i]);
        }
        this.mockedObjectArray.push({ mockObject: this.mockShowInformationMessageObj, count: resolve.length });
    }

    public assertMocks() {
        this.mockedObjectArray.forEach(({ mockObject: object, count: cnt }) => {
            sinon.assert.callCount(object, cnt);
        })
    }
}