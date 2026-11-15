# Moving Crophalo to another Mac

The folder is the whole program. Copy it, double-click, and it sets itself up. Your saved fields, notes and reminders do not travel by themselves: they live in the browser. Save them to a backup file first and restore that file on the new Mac (step 1).

## Three steps

1. **On the old Mac, save a backup file.** Open Crophalo, go to **Settings**, then **Saved on this device**, and choose **Download a backup file**. Keep that file with the folder. (If the folder copy of your data is switched on in your start-up, `.userdata` also holds a copy; the backup file is the one to rely on.)
   If the new Mac will have no internet, also run this once in Terminal: `sh scripts/pack-runtimes.sh`. It puts the tools for both kinds of Mac into the folder (about 540 MB).
2. **Copy the whole Crophalo folder.** A USB stick, AirDrop, the network or a zip file all work. The hidden parts must come along, so copy the folder itself, not the files inside it one by one. You may leave out `scripts/_cache` if it is there; it is only for tests.
3. **On the new Mac, double-click `Start Crophalo.command`.** A Terminal window opens. Keep it open; closing it stops Crophalo.

## What the first start does

- It takes off the flag that macOS puts on copied files, so the tools in the folder can run.
- It sets up Node and Python inside the folder. It uses the packed tools, or downloads about 160 MB once.
- It asks for your free NASA Earthdata login. Press Return to skip; you can add it later with `sh scripts/run.sh --login`.
- It checks that everything is in place and tells you in plain words what is not.
- It opens Crophalo in your browser at `http://localhost:5480/`. If another program already uses that address, it takes the next free one, says so, and remembers it.
- Your saved fields do not come back by themselves. On the new Mac open **Settings**, then **Saved on this device**, choose **Restore from a backup file** and pick the file you saved in step 1.

The first start takes a few minutes. Later starts take a few seconds.

## If macOS will not open the starter

- macOS 14 or older: right-click `Start Crophalo.command`, choose **Open**, then **Open** again. Once is enough.
- macOS 15 or newer: open **System Settings > Privacy & Security**, scroll down and choose **Open Anyway**.
- Or open Terminal, type `sh ` (with a space after it), drag `Start Crophalo.command` into the window and press Return.

## Before you give the folder to someone else

Delete the two hidden parts `.secrets` (your NASA login, if you kept it in the folder) and `.userdata` (a copy of your saved fields, if it was switched on), and do not give away your backup file. In Finder, press Command-Shift-Period to see hidden files.

## What it needs

- macOS 11 or newer. The satellite parts need macOS 14 on a Mac with an Apple chip, or macOS 12 on an Intel Mac. On an older Mac, Crophalo still opens and says which parts it could not read.
- About 2 GB of free disk space. The folder with its tools takes about 1 GB; the rest is room for the NASA data it keeps.
- The internet for a new report, because every number is read live. Saved fields still open without it once they are restored from your backup file.

## If something goes wrong

- Read the lines in the Terminal window. A line that starts with `FIX` names the problem, and the line under it says what to do.
- The check-up runs at every start. With Node installed on the Mac you can also run it by itself: `node scripts/preflight.mjs --doctor`.
- The record of the setup is in `runtime/setup.log` inside the folder. It never holds your login.
- "This folder cannot be written to": copy the whole folder onto the Mac itself, for example into Documents, and start it there.
