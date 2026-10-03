/**
 * Publishes the package unless that version is already on the registry.
 *
 * `changeset publish` skipped an already-published version by itself, but it
 * delegates to whichever package manager it detects — pnpm here — which does
 * not implement npm's trusted publishing, so the publish went out with no
 * credentials. Calling npm directly fixes that and loses the skip, which turns
 * any re-run of a finished release into a red build.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const { name, version } = JSON.parse(readFileSync("package.json", "utf8"));

function isPublished() {
    try {
        execFileSync("npm", ["view", `${name}@${version}`, "version"], {
            stdio: "ignore",
        });
        return true;
    } catch {
        return false;
    }
}

if (isPublished()) {
    console.log(`${name}@${version} is already published; nothing to do.`);
} else {
    execFileSync("npm", ["publish", "--access", "public"], {
        stdio: "inherit",
    });
}
