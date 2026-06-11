# Installing the Claude Harness — A Friendly Step-by-Step Guide

Hi! This guide gets the **Claude Code harness** set up on your Mac. You don't
need to be technical — most of the work is done *for* you by Claude Code itself.
You'll mostly be copying one or two lines and pressing Enter.

**Time needed:** about 10–15 minutes.

---

## What you'll end up with

After this, when you use **Claude Code** (Anthropic's coding assistant) in any
project, it will automatically have a set of helpful "agents" and "skills" — like
a built-in code reviewer, a planning helper, and tidy start/end-of-day routines.
You don't have to memorize any of them; they just become available.

---

## Before you start

You need **one** thing: a **Claude account**.

- A paid **Claude Pro** or **Max** plan is the smoothest experience (recommended).
- A free Claude.ai account also works.
- If you don't have an account yet, make one at **https://claude.ai** first.

That's the only prerequisite. You do **not** need to install Node, Git, or
anything else by hand — Claude Code handles that.

---

## Step 1 — Open the Terminal

The Terminal is a plain text window where you type commands. To open it:

1. Press **⌘ Command + Spacebar** (this opens Spotlight search).
2. Type **`Terminal`** and press **Enter**.

A small window opens. Don't worry — you'll only paste a couple of lines into it.

> 💡 To paste in Terminal, use **⌘ Command + V**, then press **Enter** to run.

---

## Step 2 — Install Claude Code

Copy the line below, paste it into the Terminal, and press **Enter**:

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

This downloads and sets up Claude Code automatically. It takes a minute or two.
When it finishes, **close the Terminal window and open a fresh one** (same steps
as Step 1) so the new `claude` command is recognized.

> ✅ If you ever see "command not found: claude", just close the Terminal and
> open a new one — that almost always fixes it.

---

## Step 3 — Start Claude Code (and log in)

In the fresh Terminal window, type this and press **Enter**:

```bash
claude
```

The **first time** you run it, it will open your web browser and ask you to log
in to your Claude account. Sign in, approve the request, and come back to the
Terminal. You only have to do this once — it remembers you afterward.

You'll now see Claude Code's prompt, waiting for you to type a request.

---

## Step 4 — Let Claude Code install the harness for you

This is the easy part. While Claude Code is running (from Step 3), **paste the
message below** and press **Enter**:

```
Please install the "claude-harness" for me. Do this:
1. Clone the public GitHub repo agaleraib/claude-harness into the folder ~/.claude/harness
   (if Git isn't installed, set it up first, or download the repo as a zip and unzip it there).
2. Then open ~/.claude/harness/README.md, find the section titled "## Setup" →
   "### 1. Install User-Level Components", and run those install steps exactly
   so the agents and skills are copied into ~/.claude/.
3. Tell me when it's done and list which skills are now installed.
Explain each step in plain language as you go, and ask me to approve anything
you need permission for.
```

Claude Code will now do all the real work — downloading the harness and copying
the files into the right place. As it works:

- It may ask **permission** to run commands or change files. That's normal and
  safe here — say **yes / allow** when it asks.
- If it needs a tool that isn't installed yet (like Git), it will offer to set it
  up — let it.

Just follow along and approve its requests. When it's finished, it will tell you.

---

## Step 5 — Check that it worked

Still inside Claude Code, type a single forward slash:

```
/
```

A menu should pop up listing available **skills**. If you can see names like
**`/session-start`**, **`/commit`**, **`/micro`**, and **`/park`** in that list,
🎉 **the harness is installed correctly.**

You can press **Escape** to close the menu. You're done!

---

## Using it from now on

To use Claude Code on any project on your computer:

1. Open Terminal.
2. Go into the project's folder. The easiest trick: type `cd ` (with a space),
   then **drag the project folder** from Finder onto the Terminal window, and
   press **Enter**.
3. Type `claude` and press **Enter**.

The harness agents and skills come along automatically — nothing extra to do.

---

## If something goes wrong

| What you see | What to do |
|---|---|
| `command not found: claude` | Close the Terminal window, open a new one, try again. |
| The browser login didn't open | In Terminal, press **Ctrl + C**, then type `claude` again. |
| Claude Code asks for permission a lot | That's expected — choose **allow**. You can also pick "allow for this session." |
| You're unsure at any step | Just **ask Claude Code in plain English** — e.g. type "I'm stuck on the install, what should I do?" It will help. |

When in doubt, the safest move is to **ask Claude Code itself** what to do next —
that's exactly what it's good at.

---

## Need to update the harness later?

When there's a new version, open Claude Code (Step 3) and paste:

```
Please update my claude-harness: go to ~/.claude/harness, pull the latest from
GitHub, then re-run the user-level install steps from its README's "## Setup"
section so my agents and skills are refreshed.
```

---

<details>
<summary><b>Appendix — Manual install (for a technical helper, optional)</b></summary>

If someone comfortable with the Terminal wants to do it by hand instead of
letting Claude Code drive, here are the exact steps. This mirrors the repo's
`README.md` → **## Setup** section.

```bash
# 1. Get the harness source
git clone https://github.com/agaleraib/claude-harness.git ~/.claude/harness
cd ~/.claude/harness

# 2. Copy the universal agents
mkdir -p ~/.claude/agents
cp .claude/agents/code-reviewer.md   ~/.claude/agents/
cp .claude/agents/spec-planner.md    ~/.claude/agents/
cp .claude/agents/project-tracker.md ~/.claude/agents/
cp .claude/agents/orchestrator.md    ~/.claude/agents/

# 3. Copy the core skills (whole directories — many ship lib/ helpers and
#    templates the skill can't run without, so copy the folder, not just SKILL.md)
for skill in session-start session-end micro park commit project-init \
             setup-harness deploy-check api-smoke-test migration-check a11y-check \
             run-wave close-wave archive-plan harness-status planning-loop \
             memory-prune shared-root-init triage-parking apply-anthropic-reviews \
             skill-creator; do
  rm -rf ~/.claude/skills/$skill
  cp -R skills/$skill ~/.claude/skills/$skill
done

# 4. Copy the shared receipt helper (used by several skills)
mkdir -p ~/.claude/skills/_shared/lib
cp skills/_shared/lib/emit-receipt.sh ~/.claude/skills/_shared/lib/
```

That's the whole user-level install. Project-level setup for a specific repo is
done later with the `/setup-harness` and `/project-init` skills from inside that
project.

</details>
