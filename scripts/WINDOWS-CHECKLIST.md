# Trying Crophalo on a Windows PC

**Read this first.** The Windows starter (`Start Crophalo.bat`, `Start Crophalo (Add NASA login).bat` and `scripts\start-windows.ps1`) was written with care and read line by line, but **it has not been run on a Windows PC yet**. You are the first to try it. Go through the steps below and send back what you see, also when everything works.

## Before you start

- A PC with Windows 10 or 11 (64-bit, Intel or AMD chip) and the internet.
- The whole Crophalo folder on the PC's own disk. A short place is best: `C:\Crophalo`.
- If Crophalo came as a zip file: right-click the zip, choose **Extract All**, and use the new folder. Do not start it from inside the zip.
- The first start downloads, once, into the folder: Node (36 MB), the Python installer (15 MB), Python (22 MB) and the NASA data libraries (the four largest are 51 MB together). Nothing is installed on the PC itself.

## The steps, and what you should see

1. **Double-click `Start Crophalo.bat`.** A black window opens and says `Starting Crophalo. Keep this window open: closing it stops Crophalo.`
   Windows may ask first whether to run it. See "Five things" below, number 1.
2. Only if the folder came from a downloaded zip: `Took the Windows download flag off N files, so Crophalo's own tools can run.`
3. `Getting Node 22.23.5 for Crophalo (about 36 MB, once)...` This line does not show if the PC already has Node 20 or newer.
4. `Setting up Python and the NASA data tools inside this folder (a few minutes, once)...` and, after a few minutes, `The NASA data tools are ready.`
5. **The NASA login question.** Five lines about the satellite products, then `NASA Earthdata username:`.
   - Press Enter to skip (`Skipped. To add the login later: ...`), or type the username and then the password. The password shows only as stars.
   - `Where should Crophalo keep this login?` Type `1` (only on this PC: the file `.netrc` in your home folder, `C:\Users\<you>`) or `2` (inside the Crophalo folder, in `.secrets`).
   - You should see `Saved in your home folder (.netrc), so it stays on this PC.` or `Saved inside the Crophalo folder (.secrets), so it moves with the folder.`
6. **The check-up.** A list of lines that start with `ok`, `FIX` or `note`. On a good start every service line says `ok`, and `Python 3.12.x and the NASA data tools load` is there.
7. `Crophalo is running: http://localhost:5480/` and your browser opens on that address with the Crophalo page.
8. **Stop it.** Press Ctrl-C in the black window (Windows may then ask `Terminate batch job (Y/N)?`: type `Y` and Enter), or just close the window. The page in the browser should stop answering.
9. **Start it again.** This time it should take seconds: no download, no login question, the same address.
10. **While it runs, double-click `Start Crophalo.bat` once more.** The second window should say `Crophalo is already running from this folder: ...`, open the browser and close by itself.
11. **Double-click `Start Crophalo (Add NASA login).bat`** (stop Crophalo first). It should ask for the login again, then start as usual.
11b. **While Crophalo runs, double-click `Start Crophalo (Add NASA login).bat`.** It should ask for the login, say where it was saved and `The running Crophalo uses this login from its next lookup.`, then `Crophalo is already running from this folder: ...`, and close by itself. No second Crophalo starts: the first window keeps running.
11c. **If you chose `1` and the file `.netrc` in your home folder holds logins of other services too**, they must still be there afterwards, also one written on the same line as the NASA one. Look with Notepad: `notepad $HOME\.netrc` in a PowerShell window.
12. **Copy the whole Crophalo folder to a second place** (the Desktop, say) and, while the first copy runs, double-click `Start Crophalo.bat` in the second one. It must not say `already running`: it starts its own server on the next port (`Port 5480 is in use by another program, so Crophalo uses 5481.`). Delete the second copy afterwards.

Afterwards the folder holds new parts: `runtime`, `.venv` and, if you chose it, `.secrets`. Nothing else on the PC should have changed, apart from the file `.netrc` in your home folder if you chose `1`.

## If a step fails: what to send back

- The number of the step, and the words in the black window from that step on (select them with the mouse and press Enter to copy, or take a picture).
- The last 40 lines of the setup record. In the Crophalo folder, hold Shift, right-click an empty spot, choose **Open PowerShell window here**, then type:

  `Get-Content runtime\setup.log -Tail 40`

- Your Windows version (press the Windows key, type `winver`, press Enter).
- **Never send the NASA login.** The setup record never holds it. A picture of the window can show the username you typed: cut that line off, or send the copied words without it.

## Five things most likely to differ on a real PC

1. **Windows guarding against downloaded files.** On the first double-click Windows may show "Windows protected your PC" (choose **More info**, then **Run anyway**) or "Open File - Security Warning" (choose **Run**). If it will not let you: right-click the zip before unpacking it, choose **Properties**, tick **Unblock**, and unpack again.
2. **The virus scanner.** It may hold or remove a tool that was just downloaded (`node.exe`, `uv.exe`, `python.exe`). You would see `Crophalo needs Node to run and could not get it` or `The NASA data tools are not set up: ...`. Start again once; if it fails the same way, send the setup record.
3. **Where the folder sits.** Desktop and Documents are often kept in step with OneDrive, some PCs guard those folders against new programs, and Windows refuses very long file names. If the setup fails in such a place, move the folder to `C:\Crophalo` and start again. A network drive is not a good place either.
4. **A work or school PC.** It may forbid scripts (you would see `This PC is set up so that scripts cannot do their work...`) or block the download sites: nodejs.org, github.com, releases.astral.sh, pypi.org and files.pythonhosted.org.
5. **The black window itself.** A click inside it can freeze Crophalo: the window's title then starts with "Select". Press Esc to let it go on. If port 5480 is taken by another program, Crophalo says so and uses the next free one.

## Good to know

- The login kept inside the folder (`.secrets`) is closed to every other Windows user. If the folder travels to another person's PC on a disk that keeps such rights (most USB sticks do not), Crophalo cannot read it there and simply asks again.
- For now a few lines of the check-up and of the server still name the Mac starter (`Start Crophalo.command`, `sh scripts/run.sh`). On Windows, read them as the two `.bat` files.
