---
name: Build Failed Issue
about: Something went wrong with CI build
title: Build Failed Issue [{{payload.sender.login}}]
labels: Build Failed
assignees: bishal-pdMSFT, vineetmimrot, kanika1894

---

Event triggered by: {{payload.sender.login}}
Workflow: {{ workflow }}
Branch: {{ref}}

Something went wrong with GitHub checks for {{ workflow }}. For more info visit-

https://github.com/microsoft/vscode-deploy-azure/actions?query=workflow%3A%22Extension%20Test%20analysis%22%20is%3Afailure