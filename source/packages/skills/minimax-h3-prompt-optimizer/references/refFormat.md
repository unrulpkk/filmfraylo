# Ref2VA final output contract

Read this after planning and reference mapping, immediately before writing the final Ref2VA prompt. The instructions below describe output syntax, not a story to reuse.

Write every narrative sentence in ENGLISH, including definitions, summary, retention explanations, shot descriptions, soundscape and music. The language of the user's request does not change this contract. Preserve original dialogue, lyrics, visible scene text and actual proper names only. Do not produce a Chinese paraphrase of the prompt.

## Official section order

Use exactly these six header lines, with an ASCII colon:

1. subject_definitions:
2. summary:
3. retention_analysis:
4. detailed_description:
5. overall_soundscape:
6. non_diegetic_music:

Write the complete prompt directly. No markdown fences, blockquotes, introductory title, Chinese summary, JSON wrapper or unreplaced template variables. If the user selected the explicitly custom enhanced format, follow its documented additional field; never label that extension official.

## Definitions and reference fidelity

Define every referenced asset and reusable subject. Keep Picture, Video and Audio indices independent and bound to their actual sources. One asset can define multiple subjects and one subject can use multiple assets. Preserve previously established mappings. Mention audio timbre bindings only when the user has actually assigned a voice to a speaker; never assume voice identity from attachment order. Do not invent unknown appearance or transcribe unheard audio.

Assign recurring characters or products stable <Subject N> labels and define their real names and source assets; do not substitute asset definitions for reusable-subject definitions. Speaker IDs belong to the voice bindings and actual speech, not retention explanations.

The summary begins with the appropriate square-bracketed task types. Include audio reference when timbre is referenced, and audio reuse only when the signal is copied. Camera-motion reference is not source-video editing.

For visual references, use the literal markers fully_preserved, partially_preserved, attribute_transfer or weak_reference. For audio, use fully_copy, partially_copy, reference or weak_reference. Explanations remain English. Keep each label's meaning unchanged between definitions, summary, retention and timeline.

## Dialogue and timeline

Start the actual timeline with [Shot 1]. Later cuts use [Shot N] At MM:SS.mmm, with increasing times inside the specified duration. Describe a concrete final state at the actual end; do not add events beyond it. Maintain requested character positions, appearance, props, environment and lighting. Camera motion states a meaningful direction, extent and pace.

Assign (S1), (S2) in first ACTUAL vocal order, regardless of Subject or Audio numbering. At the actual spoken line, write the correctly bound speaker ID and <d>[Language] original words</d>. Preserve every supplied word and punctuation mark, including multilingual exchanges and lyrics. A voice reference does not provide new dialogue. Narration is distinct from visible speaking; never shorten an overlong line silently.

Keep ambient/action sound separate from score. Do not repeat dialogue in overall_soundscape. Without requested background music, non_diegetic_music is N/A.

## Final independent check

Before replying, check all six headers and their order, English narrative, literal retention markers, complete original lines, speaker identity and voice binding, defined references, timing and user preserve/change constraints. Correct an unambiguous format error at most once; report uncertain semantic issues separately without overwriting the previous accepted prompt. A tool read succeeding is not evidence that an image, video or audio was perceptually analyzed.
