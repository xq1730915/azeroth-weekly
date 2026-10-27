import {existsSync} from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
const env={...process.env};
// These optional local tool caches were downloaded and SHA256-verified during setup.
if(existsSync('.cache/nsis-direct/Bin/makensis.exe')){
  env.ELECTRON_BUILDER_NSIS_DIR=path.resolve('.cache/nsis-direct');
  env.ELECTRON_BUILDER_NSIS_RESOURCES_DIR=env.ELECTRON_BUILDER_NSIS_DIR;
}
if(existsSync('.cache/7zip/bin/7za.exe'))env.ELECTRON_BUILDER_7ZIP_PATH=path.resolve('.cache/7zip/bin/7za.exe');
const child=spawn(process.execPath,['node_modules/electron-builder/cli.js','--win','--x64'],{stdio:'inherit',env,shell:false});
child.once('error',error=>{console.error(error);process.exitCode=1;});
child.once('exit',code=>{process.exitCode=code??1;});
