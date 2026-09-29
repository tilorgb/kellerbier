---
name: grill-me
description: Interview the user relentlessly about a plan or design until reaching a shared understanding, resolving each branch of the decision tree. Use when the user wants to stress-test a plan, get grilled on their design, or mentions "grill me".
---

Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one by one. For each question, provide your recommended answer.

Ask the questions one at a time.

**Ask every question with the `AskUserQuestion` tool, never as plain text in the reply.** The user
answers by clicking, often from the phone app, so a question typed into the message body is one
they have to type an answer to. One question per call, 2-4 concrete options, the recommended one
first with "(Recommended)" at the end of its label, and each option's `description` saying what
picking it would mean for the implementation. Put the context the user needs (what the code
currently does, why the question matters) in a short message *before* the tool call, not crammed
into the question text. "Other" is always available to them, so don't add an "other" option.

If a question can be answered by exploring the codebase, explore the codebase instead.
