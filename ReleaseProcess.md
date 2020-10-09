**Process for releasing a new version of VSCode extension - Deploy to Azure**

1. Update the new version in package.json and package-lock.json 
2. Add one liner for the new version in ChangeLog.md and make changes in README.(if required).
3. Create a release branch with the version name. Example, for version v1.2.3, create a new branch releases/v1.2.3.
4. Run the [pipeline](https://dev.azure.com/mseng/AzureDevOps/_build?definitionId=9571&_a=summary) with the release branch created.
5. Download the artifacts and get the [BVT testing](https://drive.google.com/file/d/1vLZ1I-LObjnV-6L3CPOSll1gbH4TJwA-/view?usp=sharing) done using the corresponding Vsix with the vendor team.
6. Create a tag for the corresponding version, using [Draft a new release](https://github.com/microsoft/vscode-deploy-azure/releases).
7. Upload the VSIX at the [marketplace](https://marketplace.visualstudio.com/manage/publishers/ms-vscode-deploy-azure?noPrompt=true).
