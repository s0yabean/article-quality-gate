---
title: Testing a support-ticket router against 500 tickets people had already routed
description: "SYNTHETIC SAMPLE. The approved rewrite of sample 05: the internal-note section is replaced by a reusable method."
date: 2026-10-05
kind: case-study
audience: technical
status: published
synthetic: true
stats:
  - label: Agreement with human routing
    value: 91% (was 74%)
  - label: Tickets sent to a person
    value: 18%
---

**In short.** A fictional 30-person software company replaced a keyword ticket router with a small classifier that returns a probability for each team. Tested on 500 tickets that people had already routed, agreement rose from 74% to 91%. The 18% of tickets the classifier was unsure about went to a person instead of a guess.

## The problem

The old router matched keywords. A ticket that said "invoice" went to billing, even when the customer was reporting a broken export button on the invoice page. Support leads told us they re-routed about one ticket in four by hand. We asked them to count the tickets they moved for a week, then checked: on 500 tickets from March, the router agreed with the final team 74% of the time.

## What we built

We asked a classifier one question per ticket: which of five teams should own it? It returns a probability for each team, not a single label. Plain code then decides. If the top team scores at least 0.7, the ticket goes there. If not, it goes to a person, who routes it by hand.

We kept the threshold in code, not in the prompt. Changing it from 0.7 to 0.6 is a one-line edit, and the cached answers let us re-run all 500 tickets in seconds without new calls.

## What we measured

On the same 500 tickets, the new router agreed with the final team 91% of the time on the tickets it routed. It sent 18% of tickets to a person. Those were mostly tickets that really did touch two teams, such as a refund caused by a bug.

Two things failed. Tickets written in two languages scored low on every team, so they all went to a person. And a threshold of 0.8 sent 35% of tickets to a person, which was more work than the old router created.

## What I would change

I would have built the test set first. We spent a week tuning prompts before we had 500 labelled tickets, and most of that tuning did not survive the first real test. Start with the labelled set, then change one thing at a time and measure it. Check agreement after every change, not once at the end.

## A method you can reuse

Pull 300 to 500 items that people have already decided, and keep them as a fixed test set. Score the old system and the new one on the same set. Sweep the threshold in steps of 0.1 and plot agreement against the share sent to a person. Pick the point your team can staff, then check it again every time the prompt or model changes.
