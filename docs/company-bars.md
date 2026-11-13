# Company system design bars (L4/L5)

This file holds interview research for the System Design Coach app. It covers Amazon, AWS, Google, and Microsoft at the L4 and L5 bands. The research ran on 2026-10-31. Most sources date from 2025 and 2026.

Each fact carries a tag such as [S1]. The tag points to the Sources list at the end of this file. A confidence label follows the tag. High means an official company page. Medium means two or more coaching or aggregator sources agree. Low means one source, one search snippet, or one anecdote.

The word Judgment marks a number or a claim that I derived from the sources. No source states it directly.

Terms used in this file:

- A loop is the full set of interviews for one candidate. A round is one interview in the loop.
- HLD is high-level design, which means boxes and data flow for a distributed system.
- OOD is object-oriented design, which means classes and how they relate. Some sources call it low-level design (LLD).
- LP is a Leadership Principle, one of the 16 Amazon values.
- A bar is the minimum score on the app scale. A weight is the relative importance of a dimension, from 1 (low) to 3 (high).

The app scale runs from 0 to 4. 0 is no evidence. 1 is below L4. 2 meets the L4 bar (correct, but needs some prompting). 3 meets the L5 bar (drives the design, quantifies, and justifies). 4 is an L6+ signal. The dimensions always appear in this order: requirements, estimation, api_data, architecture, deep_dive, reliability, tradeoffs, communication.

## Top findings

- The L4 and L5 labels do not line up across companies. On the levels.fyi map, Amazon L5 (SDE II) sits next to Google L4 and Microsoft 61-62. Google L5 sits next to Amazon L6 (SDE III) and Microsoft 63-64. [S10] [S30] (Medium)
- Judgment: a Google L5 target is one step above an Amazon L5 target. Do not reuse one bar for both.
- Amazon L4 (SDE I) has no HLD round in the sources. The design round is OOD. Amazon has no official SDE I prep page. [S16] [S24] (Medium)
- Google L4 has no scheduled design round in the newest reports. [S17] [S22] [S31] (Medium)
- Amazon L5 (SDE II) has at least one design question in a loop of four 55-minute rounds. LP questions appear in every round. [S1] (High) [S15] (Medium)
- Google L5 has one 45-minute design round in a loop of five rounds. [S18] [S21] (Medium)
- Microsoft makes design standard from level 61. At levels 63-64 the design round decides the level. [S19] [S23] (Medium) [S28] [S29] (Low)
- The AWS careers page describes the same process as Amazon. It gives no AWS-only design guidance. [S5] (High) Every AWS-specific bar below is Judgment.
- No company source names estimation as a scored area. Hello Interview advises delaying the math until a decision needs numbers. [S12] (Medium) Some Google interviewers press hard on capacity math. [S18] (Medium)
- Design time is short. Amazon spends 20 to 30 minutes of a round on LP questions first. That leaves about 30 minutes for design. [S15] (Medium) Google gives 45 minutes. [S18] (Medium) Microsoft gives 45 to 60 minutes. [S7] (High) [S19] (Medium)
- Hello Interview says most entry-level loops have no design round, mid-level loops often have one, and senior loops almost always have one with heavy weight. [S11] (Medium)

## What separates L4 from L5 in design rounds

Hello Interview describes three depth levels. It uses Meta-style labels (E4, E5). Judgment: map mid-level to score 2, senior to score 3, and staff and above to score 4.

- Mid-level (score 2): about 80 percent breadth and 20 percent depth. The candidate drives the early steps: requirements, API, schema, and the high-level design. The interviewer probes basics and leads the later steps. The candidate does not need to find every problem alone. [S13] [S14] (Medium)
- Senior (score 3): about 60 percent breadth and 40 percent depth. The candidate sees early what makes the system hard and ranks the requirements. The candidate finds limits in the proposed design and discusses alternatives. The candidate goes deep in about two places with hands-on detail, such as the reason for a partition key. [S13] [S14] (Medium)
- Staff and above (score 4): about 40 percent breadth and 60 percent depth. The candidate leads almost the whole round and can teach the interviewer something. [S13] (Medium)
- Worked example, Ticketmaster. A mid-level candidate defines the API and data model and builds a design that handles viewing and booking. The candidate stops double booking with a status field, a timeout, and a cron job. More depth is a bonus. A senior candidate moves through the basic design fast. Then the candidate covers search optimization, a distributed lock for double booking, and load from popular events. [S14] (Medium)
- The Hello Interview level article dates from Nov 30, 2023. [S13] Each company uses its own rubric, so the sections below give company detail.

## Amazon (teams outside AWS)

### Loop and design rounds

- SDE II loop: four 55-minute rounds. The candidate can expect at least one design question. The interviewer asks about the design. The candidate must ask questions to complete the design and make sure that it works. [S1] (High)
- Official design objectives: practicality, accuracy, efficiency, reliability, optimization, and scalability. [S1] [S2] (High)
- SDE II online assessment: 90 minutes for two coding questions, then 20 minutes of design scenarios, then an 8-minute work style survey on the LPs. [S1] (High)
- SDE III loop: five 55-minute rounds. The phone screen lasts 60 minutes, half on LPs and half on coding and design. [S2] (High)
- The official topics page is the nearest page to entry level. It lists OOD, databases, and distributed computing. It says most technical rounds include coding and design whiteboarding. It sends roles that need two or more years of experience to the SDE II page. [S3] (High)
- SDE I has no official prep page, and the official loop size is not stated. Candidate reports describe about three rounds for new graduates. [S24] (Medium)
- SDE I loop (Hello Interview): four virtual rounds. Two are coding, one is OOD of about an hour, and one is a Bar Raiser round on LPs. A Bar Raiser is an interviewer from outside the team who can veto the hire. [S16] (Medium)
- SDE II loop (Hello Interview): two coding rounds, one HLD round, and one round that is either OOD or more coding. A Bar Raiser sits inside the loop. [S15] (Medium)
- SDE II design round (Hello Interview): 60 minutes on an online whiteboard, often run by the hiring manager. LP questions take 20 to 30 minutes first. The design gets about 30 minutes. [S15] (Medium)
- IGotAnOffer (updated Apr 30, 2026): design rounds go to SDE II and above. The loop has at least one. Infrastructure, security, and platform roles can have several. [S20] (Medium)
- Interview Kickstart (Apr 6, 2026) says Amazon design interviewers look at component-level thinking, scaling, and operations. It puts each round at 45 to 60 minutes. [S33] (Low)
- A Bangalore SDE II loop from Jul 27, 2026 had one coding round, one OOD round, one HLD round, and one Bar Raiser round. The candidate says LPs were scored in every round. [S26] (Low)
- Count: one HLD round is typical, and the range is one to two. One aggregator claims two design rounds and cites no evidence. [S27] (Low)

### L4 versus L5 at Amazon

- SDE I (L4): the design round covers classes, not distributed systems. Interviewers look for strong basics and potential. Examples from school or internships are fine. The LP round often decides the result. [S16] (Medium)
- SDE II (L5): the candidate must run a distributed design alone, without heavy guidance. The candidate must show solid basics on caching, database choice, and scale. The interviewer asks follow-ups on more load, failures, and new features. [S15] (Medium)
- Official SDE II description: the engineer works with autonomy and trades feature work against operational work. The engineer documents how the software is built, tested, operated, and secured. The engineer also mentors others. [S1] (High)
- SDE III (L6): the official page says the engineer has a system-wide architectural view and leads on the team. [S2] (High) One blog says the second SDE III design round goes wide into cost, operations, and the other teams that a failure hurts. [S25] (Low)
- Interviewers give hints. How the candidate uses a hint counts in the score. [S15] (Low)

### What Amazon stresses in design rounds

- LPs are scored in every round. That includes the design round. Amazon lists 16 LPs. [S4] (High) [S15] [S26] (Medium)
- Judgment: LPs map to the app dimensions as follows. Customer Obsession maps to requirements. Dive Deep maps to deep_dive and estimation. Ownership and Insist on the Highest Standards map to reliability. Frugality and Are Right, A Lot map to tradeoffs. Invent and Simplify maps to architecture. Bias for Action maps to communication.
- The LP text supports this map. Dive Deep says leaders stay close to details, audit often, and doubt anecdotes that disagree with metrics. Ownership says leaders think long term and do not decline work as outside their role. Insist on the Highest Standards says defects must not move downstream. Frugality says to do more with less. [S4] (High)
- One coaching blog (PracHub, Aug 2, 2026) says Amazon interviewers push on three points. The first is what breaks first and at what load. The second is the cost per million requests. The third is ownership: which alarm fires, who gets paged, and the first runbook steps. The blog names two common mistakes: retries without jitter (random delay) and missing idempotency keys (tokens that make a repeated request safe). [S25] (Low)
- DataInterview (Oct 27, 2026) describes the Amazon SDE role as owning code from design through deployment and operations. The duties include on-call. [S24] (Medium)
- Some Hello Interview candidates say LP questions took more than half of a round. One candidate had little time left for design. [S15] (Low)

### Proposed bars and weights (Judgment)

- amazon-l4: bars 2 1 2 2 1 1 2 2. Weights 2 1 3 2 1 1 2 2. Reason: the round is OOD, so the class and data model (api_data) matters most. Estimation, deep_dive, and reliability are not tested, so the bar is 1.
- amazon-l5: bars 3 2 2 3 2 2 2 3. Weights 3 2 2 3 2 3 3 2. Reason: one HLD round that the candidate runs alone. Reliability and tradeoffs carry weight because LPs such as Ownership, Dive Deep, and Frugality are scored inside the round. The bar stays at 2 for depth because Hello Interview labels Amazon L5 questions as mid-level.

## AWS (Amazon Web Services teams)

### Facts

- The AWS careers page lists four steps: application, assessments, phone interview, and in-person loop. It names the same LPs, the same work style assessment, and the same Bar Raiser as Amazon. It says AWS avoids brain teasers and wants data in answers. [S5] (High)
- AWS uses the Amazon ladder. AWS SDE I is L4 and AWS SDE II is L5. [S10] (High)
- The AWS page links to the Amazon interview pages and adds no separate design guidance. [S5] (High)
- Evidence of AWS-only emphasis is thin. IGotAnOffer says infrastructure, security, and platform roles can have several design rounds. [S20] (Medium)
- A Reddit comment, seen only as a search snippet, says SDE II design focuses on scalable architecture. It says Systems Development Engineer (SysDE) design focuses on infrastructure automation, monitoring, alerting, and fault tolerance. SysDE roles are out of scope here. [S32] (Low)

### Judgment on AWS emphasis (low confidence)

- AWS service teams build systems that other teams depend on. Expect more weight on availability, durability, and blast radius (how far one failure spreads).
- Expect a deeper dive on one hard component, such as a partitioned store or a control plane.
- Expect operations questions: alarms, runbooks, on-call, and safe deployment.
- Using AWS service names such as DynamoDB, SQS, and S3 is natural. At senior level, a coach expects specific settings, such as the partition key and sort key. [S13] (Medium)
- An infrastructure team can run two design rounds. If the team builds infrastructure, plan for two.

### Proposed bars and weights (Judgment)

- aws-l4: the same as amazon-l4. No evidence shows a difference at L4.
- aws-l5: bars 3 2 2 3 3 3 2 3. Weights 3 2 2 3 3 3 3 2. Reason: the loop matches Amazon L5. Judgment adds one point on deep_dive and reliability because AWS teams run infrastructure. Confidence is low.

## Google

### Loop and design rounds

- The official interview tips say the interview is collaborative. The candidate can ask the interviewer to clarify and can question an assumption. The candidate must name each assumption and each choice of depth or breadth, and must say why. Interviewers look at the thought process, not only the answer. Search engines and AI tools are not allowed in interviews. [S6] (High)
- Google scores four attributes: general cognitive ability, role-related knowledge (RRK), leadership, and Googleyness (culture fit). Each interviewer scores them on a standard form. A hiring committee reviews the feedback. [S21] (Medium) The official Google hiring page did not load in my scrapers.
- L4 loop (Hello Interview, updated Feb 10, 2026): a Google Hiring Assessment, a recruiter screen, one technical phone screen, and three or four onsite rounds on coding and behavior. No dedicated design round exists. A design topic can appear briefly inside a coding round. [S17] (Medium)
- L4 loop, other sources: IGotAnOffer says design is not in the L4 technical rounds. Candidate posts from 2025 and 2026 report coding and Googleyness only. [S22] [S31] (Low, snippets only)
- L5 loop (Hello Interview, updated Feb 10, 2026): a recruiter screen, two phone screens (one can be a Googleyness screen), then five rounds. The five rounds are two coding, one design, one Googleyness and leadership, and one RRK. A hiring committee decides, then team matching follows. The process takes 6 to 10 weeks. [S18] (Medium)
- L5 loop (IGotAnOffer, updated Jun 25, 2026): up to five 45-minute rounds with one design round. [S21] (Medium)
- Design round format: 45 minutes, no code, on a virtual whiteboard, a diagram tool, or Google Docs. The prompt is vague. After a first design, the interviewer adds curveballs, such as a database failure or ten times the traffic. [S18] (Medium)
- Interviewer variance: some stay at the high level. Some skip diagrams and go deep on infrastructure and capacity math, such as load balancing, request throughput, and connections per CPU. Some add API or low-level design. [S18] (Medium)
- Google interviewers often prefer that the candidate explain how a component works instead of naming a product. [S18] (Medium)
- Pacing advice: spend 5 minutes on requirements. Cover the main components in the first 20 minutes. Use the rest for deep dives where the interviewer shows interest. [S18] (Medium)
- Evaluation areas: architecture skill, trade-offs with deep technical knowledge (data partitioning, indexing, failure handling), and communication with requirements analysis. [S18] (Medium)

### L4 versus L5 at Google

- L4: the problems are well defined. No design round is scheduled. Coding weighs most in the level decision. [S17] [S21] (Medium)
- L5: a Google senior engineer coach says L5 engineers must work highly autonomously, handle severe ambiguity, and design large distributed systems from scratch. The same coach calls the design round the main hurdle at L5. [S21] (Medium)
- A weak leadership or Googleyness answer can lead to a down-level (an offer at a lower level) to L4. [S21] (Medium)
- Trade-offs are the main differentiator at L5. The candidate must justify choices such as MySQL versus Cassandra or a queue versus direct calls. [S18] (Medium)
- One L5 candidate report: the prompt was a transaction aggregation system with counts over time windows. The candidate missed depth on streaming versus batch, extensibility, and backfills. The result was leaning hire. [S21] (Low)

### What Google stresses in design rounds

- Collaboration and thinking aloud. Ask questions, state assumptions, and say why the design goes deep or broad. [S6] (High)
- Trade-offs between named alternatives. [S18] (Medium)
- Fundamentals over product names. [S18] (Medium)
- Failure handling and scale curveballs. [S18] (Medium)
- Capacity math on request from the interviewer. [S18] (Medium)
- Many loops return to in-person rounds in 2026, so practice on a physical whiteboard. [S18] (Low)

### Proposed bars and weights (Judgment)

- google-l4: bars 2 2 2 2 2 2 2 2. Weights 1 1 1 1 1 1 1 2. Reason: no design round is scheduled. If one appears, the bar is the generic mid-level bar. Communication carries weight in coding rounds too.
- google-l5: bars 3 3 2 3 3 3 3 3. Weights 2 2 2 3 3 2 3 3. Reason: one 45-minute round sets the design signal. Trade-offs, depth (partitioning, indexing, failure handling), and clear thinking aloud matter most. Estimation has bar 3 because some interviewers press on capacity math. Its weight is 2 because not all interviewers do.

## Microsoft

### Loop and design rounds

- The official technical interview page says technical rounds test problem solving and the skills of the role. Rounds are short, at 45 minutes. The candidate must ask clarifying questions and plan before solving. [S7] (High)
- The official design topic list: distributed systems, service-oriented architecture (SOA), and n-tier (layered) software design. Resiliency, high availability, auto-scaling, replication, CAP theory (consistency versus availability during network splits), and partitioning can all come up. [S7] (High)
- The official page says Microsoft engineers test their own code and the code of teammates. The page lists security, stress, boundaries, and error conditions. It states this under coding. [S7] (High) Judgment: it also signals a quality mindset for design rounds.
- The official how-we-hire page says most loops hold 2 to 4 conversations with teammates and cross-functional colleagues, each up to an hour. [S8] (High, snippet only)
- Levels: 59-60 SDE, 61-62 SDE II, 63-64 Senior SDE. [S10] [S23] (High)
- 59-60: the candidate can get no design round. If a design round happens, the bar is lower. [S23] (Medium)
- 61-62: design is standard from level 61. [S28] [S29] (Low) IGotAnOffer says the onsite has three or four coding rounds and one or two design rounds. Behavioral questions appear in every round. [S23] (Medium)
- 63-64 (Hello Interview, updated Feb 10, 2026): four to five rounds. Two or three are coding. One is a design round of about an hour. An optional As-Appropriate (AA) round with a senior leader follows. Behavioral questions sit inside the coding and design rounds. [S19] (Medium)
- Reported senior prompts: a WhatsApp-style chat and a Yelp-style review system. The interviewer adds constraints halfway, such as ten billion messages per day or video calls. [S19] (Medium)
- An interviewer comment in the Hello Interview guide: any component can become a deep dive. If the candidate picks Kafka, SQS, or RabbitMQ, the candidate must name the constraint behind the choice. Expect many interruptions. [S19] (Low)
- Another interviewer comment: at 63-64 the candidate must make reasonable assumptions and not wait for the interviewer to scope the problem. [S19] (Low) Judgment: this implies the interviewer helps scope more at 61-62.
- Problems often mirror Microsoft systems, such as Teams messaging, Xbox Live, and Azure storage. [S19] (Low)
- An undated Microsoft Life blog post (image paths suggest 2016) lists the traits of strong candidates. They include technical depth, analytical thinking, adapting to changing requirements, and handling feedback. [S9] (Low)

### L4 versus L5 at Microsoft

- 59-60: the design round can be skipped, and the bar is lower. [S23] (Medium)
- 61-62: the design round is standard. [S23] (Medium) Judgment: the candidate builds a working HLD, answers basic questions on each component, and accepts help with scoping.
- 63-64: the design round decides whether the candidate lands at 63-64 or lower. The candidate must make assumptions, scope the problem alone, and suggest improvements. Too many clarifying questions count against the candidate. [S19] (Medium)
- At senior level the candidate must drive the conversation. [S23] (Medium)

### What Microsoft stresses in design rounds

- Hello Interview names four areas. The first is architectural vision. The second is scalability and reliability, which covers load balancing, sharding, replication, and failure handling. The third is trade-offs and justification, such as SQL versus NoSQL or eventual versus strong consistency. The fourth is communication. [S19] (Medium)
- The candidate must not spend time on every endpoint or schema. [S19] (Medium)
- Behavioral questions sit inside every round. [S19] [S23] (Medium)
- If the earlier rounds go well, an AA round follows. [S19] [S23] (Medium)

### Proposed bars and weights (Judgment)

- microsoft-l4eq (61-62): bars 2 1 2 2 2 2 2 2. Weights 2 1 2 3 2 3 2 2. Reason: a working HLD plus the resiliency, replication, and partitioning basics that the official page lists. The interviewer helps with scoping at this level.
- microsoft-l5eq (63-64): bars 3 2 2 3 3 3 3 3. Weights 2 2 1 3 3 3 3 3. Reason: the design round decides the level. The candidate scopes with stated assumptions. Any component can draw a deep dive, so scalability, reliability, and trade-offs carry the most weight.

## How company criteria map to the 8 dimensions

A slash separates one named criterion from the next. The dimension cell lists the matching dimensions in the same order.

| Source | Named criteria | App dimensions |
|---|---|---|
| Amazon official [S1] | practicality, accuracy, efficiency, reliability, optimization, scalability | architecture, estimation, reliability, deep_dive, tradeoffs |
| Amazon via Hello Interview [S15] | architectural thinking / scalability and trade-off analysis / requirement analysis / communication and diagram clarity | architecture / deep_dive and tradeoffs / requirements / communication |
| Google via Hello Interview [S18] | architectural design skill / trade-offs and deep technical knowledge (partitioning, indexing, failure handling) / communication and requirements analysis | architecture / tradeoffs, deep_dive, reliability / communication, requirements |
| Microsoft via Hello Interview [S19] | architectural vision / scalability and reliability / trade-offs and justification / communication | architecture / deep_dive, reliability / tradeoffs / communication |
| Microsoft official [S7] | resiliency, high availability, auto-scaling, replication, CAP theory, partitioning | reliability, deep_dive, tradeoffs |

No source names api_data or estimation as a scored area. Judgment: api_data stays because the sources mention an API or schema at all three companies. Estimation stays because some interviewers press on it.

## Summary table

Each dimension cell shows bar/weight. The order is req (requirements), est (estimation), api (api_data), arch (architecture), deep (deep_dive), rel (reliability), trade (tradeoffs), comm (communication). All bars and weights are Judgment.

| Role key | Title (level) | Design rounds | Format | req | est | api | arch | deep | rel | trade | comm |
|---|---|---|---|---|---|---|---|---|---|---|---|
| amazon-l4 | SDE I (L4) | HLD 0, OOD 1. About 55-60 min. | OOD, LP-heavy | 2/2 | 1/1 | 2/3 | 2/2 | 1/1 | 1/1 | 2/2 | 2/2 |
| amazon-l5 | SDE II (L5) | HLD 1 (range 1-2), OOD 0-1. 55 min, about 30 min of design. | HLD, LP-laced | 3/3 | 2/2 | 2/2 | 3/3 | 2/2 | 2/3 | 2/3 | 3/2 |
| aws-l4 | SDE I (L4) | Same as amazon-l4. | OOD, LP-heavy | 2/2 | 1/1 | 2/3 | 2/2 | 1/1 | 1/1 | 2/2 | 2/2 |
| aws-l5 | SDE II (L5) | Same as amazon-l5. Infrastructure teams can run more than one HLD round. | HLD, LP-laced, ops-heavy | 3/3 | 2/2 | 2/2 | 3/3 | 3/3 | 3/3 | 2/3 | 3/2 |
| google-l4 | Software Engineer III (L4) | Scheduled HLD 0. A design topic can appear inside a coding round. The slot is 45 min. | None scheduled | 2/1 | 2/1 | 2/1 | 2/1 | 2/1 | 2/1 | 2/1 | 2/2 |
| google-l5 | Senior Software Engineer (L5) | HLD 1. 45 min. | HLD, no code | 3/2 | 3/2 | 2/2 | 3/3 | 3/3 | 3/2 | 3/3 | 3/3 |
| microsoft-l4eq | Software Engineer II, SDE II (61-62) | HLD 1 (range 1-2). 45-60 min. | HLD, some API-flavored prompts | 2/2 | 1/1 | 2/2 | 2/3 | 2/2 | 2/3 | 2/2 | 2/2 |
| microsoft-l5eq | Senior Software Engineer, Senior SDE (63-64) | HLD 1 (range 1-2). 45-60 min. | HLD | 3/2 | 2/2 | 2/1 | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 |

One-line rationale per role (Judgment):

- amazon-l4: an OOD round in an LP-heavy loop. Class and data model quality matters most. No distributed design is expected.
- amazon-l5: one HLD round that the candidate runs alone in about 30 minutes. Requirements, reliability, and trade-offs carry weight because LPs are scored inside the round.
- aws-l4: same as amazon-l4. The sources show no AWS difference at L4.
- aws-l5: Amazon L5 plus one point on deep_dive and reliability. AWS teams run infrastructure. Low confidence.
- google-l4: no scheduled design round. If a design question appears, light generic mid-level bars apply.
- google-l5: one 45-minute HLD round. Trade-offs, depth, and clear thinking aloud decide it. When the interviewer pushes, capacity math counts.
- microsoft-l4eq: design is standard at 61-62. A working HLD with resiliency basics meets the bar.
- microsoft-l5eq: the design round decides the level. The candidate scopes with assumptions and defends trade-offs under constant probing.

## Cross-company level map

| Rung | Amazon | Google | Microsoft | Rough years (Low) | App role keys |
|---|---|---|---|---|---|
| Entry | L4, SDE I | L3, Software Engineer II | 59-60, SDE | 0-2 | amazon-l4, aws-l4 |
| Mid | L5, SDE II | L4, Software Engineer III | 61-62, SDE II | 2-5 | amazon-l5, aws-l5, google-l4, microsoft-l4eq |
| Senior | L6, SDE III | L5, Senior Software Engineer | 63-64, Senior SDE | 5-10 | google-l5, microsoft-l5eq |
| Staff and principal | L7, Principal SDE | L6, Staff Software Engineer | 65-67, Principal SDE | out of scope | none |

Sources for the table: levels.fyi lists the Amazon, Google, and Microsoft titles and codes. [S10] (High) My scrape flattened its grid, so the row alignment comes from testRigor, Quora, and the Hello Interview labels. [S30] [S15] [S17] [S18] [S19] (Medium) The years column comes from blogs and is rough. [S30] (Low)

Mapping result:

- Amazon L4 matches Microsoft 59-60. Amazon L5 matches Microsoft 61-62.
- Google L4 matches Microsoft 61-62. Google L5 matches Microsoft 63-64.
- Amazon L5 and Google L4 are the same rung. Google L5 is the same rung as Amazon L6.

Microsoft codes mapped to the two app entries (Judgment):

- microsoft-l4eq maps to 61-62.
- microsoft-l5eq maps to 63-64.

Reasons for this choice:

- Design rounds are standard from 61. At 59-60 the design round can be skipped. [S23]
- The app scale puts the L4 bar at mid-level and the L5 bar at senior level. That matches 61-62 and 63-64.
- A bar set too low gives false confidence. A bar set too high costs extra practice. The first error is worse.
- A candidate who targets 59-60 must use the amazon-l4 profile instead.

## Reported system design questions

Hello Interview and IGotAnOffer build these lists from candidate reports. Neither page shows a date per question. The pages carry update dates in 2025 and 2026. Glassdoor feeds some IGotAnOffer lists. I did not read Glassdoor.

### Amazon

- Design a highly concurrent event ticket booking platform, like BookMyShow. HLD, SDE II loop, Jul 27, 2026. [S26]
- Design a notification system. HLD, Hello Interview mid-level list. [S15]
- Design Amazon Lockers. Hello Interview and IGotAnOffer list it. HLD and OOD versions exist. [S15] [S20]
- Design a parking payment system. HLD, IGotAnOffer, Apr 30, 2026. [S20]
- Design a warehouse system that assigns tasks to workers or robots by proximity and urgency. HLD, IGotAnOffer. [S20]
- Design Uber. HLD, Hello Interview list. [S15]
- Design YouTube. HLD, Hello Interview list. [S15]
- Design a URL shortener. HLD, IGotAnOffer. [S20]
- Design Amazon.com so it handles ten times more traffic. HLD, IGotAnOffer. [S20]
- OOD prompts: a parking lot management and rental system, an extensible alerting and notification platform, library checkout, and elevator control. [S15] [S16] [S26]

### AWS

No question list with an AWS team label exists in the sources I read. Use the Amazon list.

### Google

L4 has no design round, so no L4 design list exists. L5 prompts:

- Design a distributed blocking or denylist system. Hello Interview list. [S18]
- Design a distributed cache. Hello Interview and IGotAnOffer. [S18] [S21]
- Design a global VM monitoring system. Hello Interview list. [S18]
- Design a trending hashtags system. Hello Interview list. [S18]
- Design a ticket booking system. Hello Interview list. [S18]
- Design a transaction aggregation system with counts over time windows. IGotAnOffer candidate report. [S21]
- Design an image hosting website. IGotAnOffer. [S21]
- Design a TikTok-style news feed. IGotAnOffer. [S21]
- Design a small image, GIF, and video hosting platform with no sign-up. IGotAnOffer. [S21]

### Microsoft

Hello Interview senior list (63-64):

- Design a rate limiter. [S19]
- Design a distributed cache. [S19]
- Design a presence service API. [S19]
- Design a chat or messaging system. [S19]
- Design a Top-K system. [S19]

IGotAnOffer list (2025 update, no per-question dates, no level label). Judgment: the API-flavored and product-flavored prompts fit 61-62. [S23]

- Design an IDE like Visual Studio.
- Design Instagram, Uber, or Dropbox.
- Design OpenTable.
- Design a shopping cart for Amazon.com.
- Design an API for a running app or a tic-tac-toe game.
- Design a library system with online and offline customers.
- Design a Teams feature for university students in Japan.
- Design a microservice for high-volume real-time transactions, with API structure, data storage, and fault tolerance.
- Design a website for world-scale traffic.

## Where sources disagree

- Amazon SDE II design count. Official: at least one. Hello Interview: one HLD round. onsites.fyi: two. This file uses one, with a range of one to two. [S1] [S15] [S27]
- Amazon SDE I design. The Hello Interview L4 guide lists one OOD round. The Hello Interview L5 guide says L4 candidates skip design rounds. DataInterview says junior loops use OOD. This file uses HLD 0 and OOD 1. [S16] [S15] [S24]
- Amazon design round length. Official: 55-minute rounds. Hello Interview: 60 minutes. IGotAnOffer: 45 minutes. Interview Kickstart: 45 to 60 minutes. This file uses a 55-minute slot with about 30 minutes of design. [S1] [S15] [S20] [S33]
- Amazon SDE I loop size. Hello Interview: four rounds. DataInterview: about three. [S16] [S24]
- Google L4 design. Most sources report none. One YouTube summary, seen only as a snippet, lists design for L4 and above. [S34] This file uses none scheduled.
- Google L5 loop shape. Hello Interview: two coding, one design, one Googleyness, one RRK. One IGotAnOffer candidate story: three coding, one design, one Googleyness. Both show one design round. [S18] [S21]
- Microsoft round length. Official: 45 minutes. IGotAnOffer: about 60. Hello Interview: about an hour for senior design. This file uses 45 to 60 minutes. [S7] [S23] [S19]
- Microsoft senior band. levels.fyi, IGotAnOffer, Design Gurus, and Hello Interview say 63-64. ShiftMag says 63 is senior and 64 is principal. testRigor says 62-63. This file uses 63-64. [S10] [S23] [S19] [S30]
- Microsoft 61-62 design count. IGotAnOffer says one or two. TechScreen and SpaceComplexity say standard from 61. Hello Interview has no mid-level Microsoft guide. [S23] [S28] [S29]

## Gaps in this research

- The official Google hiring page did not load in two scrapers. The Google attributes come from IGotAnOffer.
- Amazon has no SDE I prep page. SDE I facts come from Hello Interview and DataInterview.
- Reddit blocked both scrapers. The AWS comment is a search snippet only.
- No question list names an AWS team.
- Microsoft 61-62 design details come from aggregators and one IGotAnOffer page.
- No source dates each question.
- The research used 39 page attempts and 13 searches. The budget was about 25 pages. Thirteen attempts returned 404 pages, empty pages, or blocks.

## Sources

Types: official means a company page. Coach means a prep company or coach. Aggregator means a site that collects reports. Anecdote means one person account. "Read" means I opened the page. "Snippet" means I saw only a search result excerpt.

- S1. Amazon Jobs, SDE II Interview Prep. Official. Read. https://amazon.jobs/content/en/how-we-hire/sde-ii-interview-prep
- S2. Amazon Jobs, SDE III/Sr. SDE Interview Prep. Official. Read. https://amazon.jobs/content/en/how-we-hire/sde-iii-interview-prep
- S3. Amazon Jobs, Software development interview topics. Official. Read. https://amazon.jobs/content/en/how-we-hire/interview-prep/software-development-topics
- S4. Amazon Jobs, Leadership Principles. Official. Read. https://amazon.jobs/content/en/our-workplace/leadership-principles
- S5. AWS Careers, How we hire. Official. Read. https://aws.amazon.com/careers/how-we-hire/
- S6. Google Careers, Interviewing at Google: best practices, advice, and tips. Official. Read. https://www.google.com/about/careers/applications/interview-tips/
- S7. Microsoft Careers, Technical interviews. Official. Read. https://careers.microsoft.com/v2/global/en/hiring-tips/technical-interviewing
- S8. Microsoft Careers, How we hire. Official. Snippet. https://careers.microsoft.com/v2/global/en/hiring-tips.html
- S9. Microsoft Life blog, How to ace a technical interview at Microsoft. Official, undated. Read. https://news.microsoft.com/life/how-to-ace-a-technical-interview-at-microsoft/
- S10. Levels.fyi, compare Amazon, Google, and Microsoft for Software Engineer. Aggregator. Read. https://www.levels.fyi/?compare=Amazon,Google,Microsoft&track=Software%20Engineer
- S11. Hello Interview, System Design in a Hurry: introduction. Coach. Read. https://www.hellointerview.com/learn/system-design/in-a-hurry/introduction
- S12. Hello Interview, System Design in a Hurry: delivery. Coach. Read. https://www.hellointerview.com/learn/system-design/in-a-hurry/delivery
- S13. Hello Interview, The System Design Interview: What is Expected at Each Level (Nov 30, 2023). Coach. Read. https://www.hellointerview.com/blog/the-system-design-interview-what-is-expected-at-each-level
- S14. Hello Interview, Ticketmaster breakdown. Coach. Read. https://www.hellointerview.com/learn/system-design/problem-breakdowns/ticketmaster
- S15. Hello Interview, Amazon L5 (SDE II) guide (published Aug 3, 2025, with 2026 edits). Coach. Read. https://www.hellointerview.com/guides/amazon/l5
- S16. Hello Interview, Amazon L4 (SDE I) guide (Aug 3, 2025). Coach. Read. https://www.hellointerview.com/guides/amazon/l4
- S17. Hello Interview, Google L4 guide (updated Feb 10, 2026). Coach. Read. https://www.hellointerview.com/guides/google/l4
- S18. Hello Interview, Google L5 guide (updated Feb 10, 2026). Coach. Read. https://www.hellointerview.com/guides/google/l5
- S19. Hello Interview, Microsoft Senior L63-L64 guide (updated Feb 10, 2026). Coach. Read. https://www.hellointerview.com/guides/microsoft/senior
- S20. IGotAnOffer, Amazon system design interview (updated Apr 30, 2026). Coach. Read. https://igotanoffer.com/en/advice/amazon-system-design-interview
- S21. IGotAnOffer, Google L5 interview (updated Jun 25, 2026). Coach. Read. https://igotanoffer.com/en/advice/google-l5-interview
- S22. IGotAnOffer, Google L4 interview. Coach. Snippet. https://igotanoffer.com/en/advice/google-l4-interview
- S23. IGotAnOffer, Microsoft software engineer interview (2025 update). Coach. Read. https://igotanoffer.com/blogs/tech/microsoft-software-development-engineer-interview
- S24. DataInterview, Amazon software engineer interview guide (Oct 27, 2026). Aggregator. Read. https://www.datainterview.com/blog/amazon-software-engineer-interview
- S25. PracHub, Amazon system design interview is a leadership test with a whiteboard (Aug 2, 2026). Coach blog, opinion. Read. https://prachub.com/resources/amazon-s-system-design-interview-is-a-leadership-test-with-a-whiteboard
- S26. Medium, Amazon SDE II (L5) interview experience, Bangalore (Jul 27, 2026). Anecdote. Read. https://medium.com/@jordan.m.2/amazon-sde-ii-l5-interview-experience-bangalore-dsa-lld-hld-bar-raiser-5ddaa4c0edf3
- S27. onsites.fyi, Amazon SDE II 2025 interview questions (Jan 27, 2025). Aggregator, low trust. Read. https://www.onsites.fyi/blog/article/amazon-sde-ii-software-engineer-interview-questions
- S28. TechScreen, Microsoft interview process 2026. Aggregator. Snippet. https://techscreen.app/articles/microsoft-technical-interview-process-2026
- S29. SpaceComplexity, Microsoft software engineer interview guide. Aggregator. Snippet. https://spacecomplexity.ai/blog/microsoft-software-engineer-interview
- S30. Level mapping extras, all snippets: https://testrigor.com/blog/engineering-levels-in-different-companies-compared/ and https://www.quora.com/Microsoft-and-Amazon-What-is-the-general-conversion-between-levels-titles-at-the-two-companies and https://www.designgurus.io/blog/microsoft-software-engineer-levels and https://shiftmag.dev/microsofts-software-engineering-career-ladder-9318/ and https://rajendrauppal.substack.com/p/understanding-levels-at-google-microsoft
- S31. Google L4 candidate posts, both snippets: https://medium.com/@philshanshan/my-google-software-engineer-interview-journey-l4-a-first-person-tale-99219202c7c7 and https://www.linkedin.com/posts/sameer-bhardwaj1298_if-you-are-applying-for-google-l3-or-l4-activity-7480599219251343360-c-Wd
- S32. Reddit r/leetcode, Need tips for System Design round for Amazon SDE-2. Anecdote. Snippet. https://www.reddit.com/r/leetcode/comments/1lnqgd1/need_tips_for_system_design_round_for_amazon_sde2/
- S33. Interview Kickstart, Amazon SDE interview guide (Apr 6, 2026). Coach. Snippet. https://interviewkickstart.com/interview-questions/companies/amazon/sde-interview-guide
- S34. YouTube, Google SWE interview process 2026: full loop explained. Anecdote. Snippet. https://www.youtube.com/watch?v=xmS0ZD2gwtc
