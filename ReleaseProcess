**Process for releasing a new version of VSCode extension - Deploy to Azure**

1. Update the new version in package.json and package-lock.json 
2. Make required changes in the ChangeLog.md and readMe(if required).
3. Create a release branch with the version name. Example, for version v1.2.3, create a new branch releases/v1.2.3.
4. Run the [pipeline](https://dev.azure.com/mseng/AzureDevOps/_build?definitionId=9571&_a=summary) with the release branch created.
5. Download the artifacts and do one basic round of testing with the VSIX.
6. Upload the VSIX at the [marketplace](https://marketplace.visualstudio.com/manage/publishers/ms-vscode-deploy-azure?noPrompt=true).
