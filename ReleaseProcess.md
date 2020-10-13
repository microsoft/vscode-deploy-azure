**Process for releasing a new version of VSCode extension - Deploy to Azure**

1. Update the new version in package.json and package-lock.json 
2. Add concise description of the changes in the new version in ChangeLog.md and make changes in README.(if required).
3. Create a release branch for every major version update. Example, for version v1,v2,v3, create new branch : releases/v1, releases/v2, releases/v3.
4. Run the [pipeline](https://dev.azure.com/mseng/AzureDevOps/_build?definitionId=9571&_a=summary) with the release branch created.
5. Download the artifacts and get the [BVT testing](https://drive.google.com/file/d/1vLZ1I-LObjnV-6L3CPOSll1gbH4TJwA-/view?usp=sharing) done using the corresponding Vsix with the vendor team.
6. Create a tag for the corresponding version, using [Draft a new release](https://github.com/microsoft/vscode-deploy-azure/releases).
7. Upload the VSIX at the [marketplace](https://marketplace.visualstudio.com/manage/publishers/ms-vscode-deploy-azure?noPrompt=true).
