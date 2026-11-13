# Dictation engine benchmark

The Mac app dictates answers with Apple's on-device `SpeechTranscriber` and its `progressiveTranscription` preset. Then [`public/dictation.mjs`](../public/dictation.mjs) fixes the system design terms that the transcriber gets wrong. This note records the measurement behind both choices. Measure again before you change the engine, the preset or the rules.

## Method

- A separate agent wrote 10 answers in spoken style, about 210 words each, with a list of the technical terms in each answer. Set 1 has answers 1 to 5, and set 2 has answers 6 to 10.
- macOS `say` read each answer in four voices: Karen (en-AU), Samantha (en-US), Daniel (en-GB) and Rishi (en-IN). Each set has 20 recordings of about 80 seconds.
- Each configuration transcribed the recordings on this Mac, with macOS 26.6.2 and the `en-AU` locale.
- The score has two parts: the word error rate against the written answer, and the term recall. If the letters of a term match one to four words in a row, the term counts as heard. For example, "Dynamo DB" counts for DynamoDB.
- Set 1 chose the engine and showed the errors that the rules fix. Set 2 came after the rules, so it measures the rules on answers that they never saw.

## Results on set 1

20 recordings, 436 uses of a term:

| Configuration | Word error rate | Term recall |
|---|---|---|
| DictationTranscriber | 19.3% | 56.0% |
| DictationTranscriber with 287 contextual strings | 18.2% | 62.2% |
| DictationTranscriber with a custom language model (weight 0.3) and the contextual strings | 18.1% | 64.7% |
| SpeechTranscriber, `progressiveTranscription` | 12.2% | 70.0% |
| SpeechTranscriber, `progressiveTranscription`, with the rules | 8.6% | 82.8% |

The last row is in-sample, because the rules came from the errors in this set.

## Results on set 2, held out from the rules

20 recordings, 436 uses of a term:

| Configuration | Word error rate | Term recall |
|---|---|---|
| SpeechTranscriber, `progressiveTranscription` | 14.7% | 65.4% |
| The same, with the rules | 12.9% | 71.1% |

## What the numbers show

- Contextual strings are a list of words that the engine prefers. A custom language model adds phrase counts and pronunciations that the Mac compiles. Both work only with DictationTranscriber. They helped it on the listed terms, but SpeechTranscriber was better on every measure without them.
- The live preset costs no accuracy. Its final text scored the same as the batch preset.
- Most errors that remain are homophones, for example "cash" for cache, "right" for write and "page 99" for p99, and misspellings of Redis. Each rule matches only a technical phrase. The 10 written answers and the ordinary sentences in `test/dictation.test.mjs` pass through the rules with no change.
- A synthetic voice is cleaner than a person in a room. The numbers compare engines. They do not predict the accuracy for one speaker.

## Measure again

- `sh mac/check-dictation.sh` plays a spoken answer through the app's own dictation code. It needs no microphone.
- `node --test test/` checks the rules against the 10 answers in `test/fixtures/spoken-answers.txt`.
- The benchmark scripts are not in the repository. To build them again, transcribe the `say` recordings with `SpeechAnalyzer(inputAudioFile:modules:)` and score them as the method says.
