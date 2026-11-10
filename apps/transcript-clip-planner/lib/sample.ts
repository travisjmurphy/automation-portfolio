import { createClip, parseTranscript, type Project } from "./transcript";

export const SAMPLE_TRANSCRIPT = `1
00:00:00,000 --> 00:00:07,400
Interviewer: You went from twelve projects at once to four. What changed?

2
00:00:08,000 --> 00:00:16,800
Maya: We were busy every day, but we kept finishing the week with nothing actually finished.

3
00:00:17,200 --> 00:00:26,600
Maya: There were six different spreadsheets, three group chats, and a lot of people asking who had the latest version.

4
00:00:27,000 --> 00:00:35,800
Maya: I thought we needed more people. What we really needed was fewer things open at the same time.

5
00:00:36,200 --> 00:00:43,000
Interviewer: That sounds simple. Was it an easy decision to make?

6
00:00:43,500 --> 00:00:53,000
Maya: Not at all. Saying yes feels productive. Every new project looks like progress when it arrives in your inbox.

7
00:00:53,400 --> 00:01:03,200
Maya: But the cost shows up later. You switch context, someone waits for feedback, and a small question holds up a whole day.

8
00:01:03,800 --> 00:01:12,500
Maya: So we made one rule. A project only starts when we have the space to finish it.

9
00:01:13,000 --> 00:01:20,500
Interviewer: What did that look like on an ordinary Monday?

10
00:01:21,000 --> 00:01:30,500
Maya: We put four cards on a wall. Each card had one owner, one next decision, and a definition of done.

11
00:01:31,000 --> 00:01:40,200
Maya: If a new request came in, we could point to the wall and ask which existing promise it should replace.

12
00:01:40,800 --> 00:01:49,400
Maya: That question changed the conversation. We were finally choosing priorities instead of collecting them.

13
00:01:50,000 --> 00:01:58,500
Interviewer: How did the team react to having fewer things on their plates?

14
00:01:59,000 --> 00:02:08,600
Maya: At first, people worried it would look like we were doing less. Then they started getting their afternoons back.

15
00:02:09,000 --> 00:02:19,200
Maya: A designer could finish a draft before moving to another brief. Feedback arrived while the work was still fresh.

16
00:02:19,800 --> 00:02:28,200
Maya: The best part wasn't a number on a dashboard. It was hearing someone say, I know what matters today.

17
00:02:28,800 --> 00:02:35,500
Interviewer: What would you tell another small studio trying this?

18
00:02:36,000 --> 00:02:45,800
Maya: Start with the work you've already promised. Write down the next decision that would move each project forward.

19
00:02:46,200 --> 00:02:56,000
Maya: You don't need a perfect system. You need a shared view of what's happening and the courage to leave a little space.

20
00:02:56,600 --> 00:03:04,500
Maya: Busy is a feeling. Finished is something you can hand to another person.
`;

export function createSampleProject(): Project {
  const source = parseTranscript(SAMPLE_TRANSCRIPT, "a-smaller-studio.srt");
  const first = createClip(source, 1, 3, "sample-clip-1", "Busy isn't the same as finished");
  first.hook = "We thought we needed more people. We needed fewer open projects.";
  first.broll = "Overlapping browser tabs; a crowded project board; a quiet studio desk.";
  first.notes = "Open on Maya. Hold half a beat after the last sentence. Keep the wording intact.";
  const second = createClip(source, 9, 11, "sample-clip-2", "Four cards. One clear priority.");
  second.hook = "A simple question that made every new request a real decision.";
  second.broll = "Four paper cards on a wall. Close-up on the owner and next-decision fields.";
  second.notes = "Use the card wall as a visual thread. This clip can follow the first as a practical example.";
  return { app: "transcript-clip-planner", version: 1, title: "A smaller studio, a better workflow", source, clips: [first, second], updatedAt: "2026-01-01T00:00:00.000Z", sample: true };
}
