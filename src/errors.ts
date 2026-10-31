/**
 * An error with a message that is safe and useful to show to a user as is.
 * The CLI prints these without a stack trace.
 */
export class RepoRadioError extends Error {
  constructor(
    message: string,
    readonly code: RepoRadioErrorCode,
  ) {
    super(message);
    this.name = "RepoRadioError";
  }
}

export type RepoRadioErrorCode =
  | "GIT_NOT_FOUND"
  | "PATH_NOT_FOUND"
  | "NOT_A_REPO"
  | "EMPTY_HISTORY"
  | "UNKNOWN_REVISION"
  | "NO_MATCHING_COMMITS"
  | "GIT_FAILED"
  | "BAD_OPTION";
