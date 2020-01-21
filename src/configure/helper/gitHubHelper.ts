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
        let params: string[] = GitHubProvider.getRepositoryIdFromUrl(remoteUrl).split('/')
        let accountName: string = params[0];
        let repoName: string = params[1];
        return `https://api.github.com/repos/${accountName}/${repoName}`;
    }

    public static getSecretId(length: number): string {
        let result: string = '';
        let characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let charactersLength = characters.length;
        for ( let i = 0; i < length; i++ ) {
           result += characters.charAt(Math.floor(Math.random() * charactersLength));
        }
        return 'AZURE_CREDENTIALS_' + result;
     }
}
