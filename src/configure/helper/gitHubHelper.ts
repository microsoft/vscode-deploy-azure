export class GitHubProvider {
    // private gitHubPatToken: string;
    private static GitHubUrl = 'https://github.com/';
    private static SSHGitHubUrl = 'git@github.com:';

    // constructor(gitHubPat: string) {
    //     this.gitHubPatToken = gitHubPat;
    // }

    public static isGitHubUrl(remoteUrl: string): boolean {
        return remoteUrl.startsWith(GitHubProvider.GitHubUrl) || remoteUrl.startsWith(GitHubProvider.SSHGitHubUrl);
    }

    public static getRepositoryIdFromUrl(remoteUrl: string): string {
        // Is SSH based URL
        if (remoteUrl.startsWith(GitHubProvider.SSHGitHubUrl)) {
            return remoteUrl.substring(GitHubProvider.SSHGitHubUrl.length);
        }

        let endCount: number = remoteUrl.indexOf('.git');
        if (endCount < 0) {
            endCount = remoteUrl.length;
        }

        return remoteUrl.substring(GitHubProvider.GitHubUrl.length, endCount);
    }

    public static getFormattedRemoteUrl(remoteUrl: string): string {
        // Is SSH based URL
        if (remoteUrl.startsWith(GitHubProvider.SSHGitHubUrl)) {
            return `https://github.com/${remoteUrl.substring(GitHubProvider.SSHGitHubUrl.length)}`;
        }

        return remoteUrl;
    }

    public static getFormattedGitHubApiUrlBase(remoteUrl: string): string {
        let params: string[] = remoteUrl.split('/')
        let accountName: string = "";
        let repoName: string = "";

        if (remoteUrl.startsWith(GitHubProvider.SSHGitHubUrl)) {
            if(params.length < 2) {
                return null;
            }
            let accountAndGithubName = params[0].split(':');
            repoName = params[1];
            if(accountAndGithubName.length < 2) {
                return null;
            }
            accountName = accountAndGithubName[1]
        } else {
            if(params.length < 5) {
                return null;
            }
            accountName = params[3]
            repoName = params[4]    
        }

        // If you're trying to create a repository with name SampleRepo.git, it'll be renamed to SampleRepo by Github
        if(repoName.endsWith(".git")) {
            repoName = repoName.substr(0, repoName.length - 4)
        }
        return `https://api.github.com/repos/${accountName}/${repoName}`;
    }
}
