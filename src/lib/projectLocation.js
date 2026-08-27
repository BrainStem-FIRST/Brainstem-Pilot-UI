// Where the project folder lives, which differs by league.
//
// FRC deploys files to the roboRIO from `src/main/deploy/`, so the folder sits inside it.
// FTC has no deploy directory — the generated OpModes have to be Java sources the build
// compiles, so the folder lives in TeamCode alongside them. Telling an FTC team to look
// under `deploy/` sends them somewhere that does not exist in their project.

export const PROJECT_FOLDER_NAME = 'brainstemPilotAuto';

export const FRC_PROJECT_PATH = `src/main/deploy/${PROJECT_FOLDER_NAME}/`;
export const FTC_PROJECT_PATH =
  `TeamCode/src/main/java/org/firstinspires/ftc/teamcode/${PROJECT_FOLDER_NAME}/`;

export function projectFolderPath(projectType) {
  return projectType === 'ftc' ? FTC_PROJECT_PATH : FRC_PROJECT_PATH;
}

/** Short label for prose: the league's own name for where this folder belongs. */
export function projectFolderParent(projectType) {
  return projectType === 'ftc' ? 'your TeamCode sources' : 'your robot code\u2019s deploy folder';
}
