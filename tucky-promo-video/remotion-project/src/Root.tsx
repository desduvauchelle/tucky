import React from "react";
import { Composition, Still } from "remotion";
import { Tucky } from "./Tucky";
import { Thumbnail } from "./Thumbnail";
import { FPS, TOTAL_FRAMES } from "./timeline";
import { NotetakerShort, TOTAL_FRAMES as NT_FRAMES } from "./notetaker/NotetakerShort";
import { DictationShort, TOTAL_FRAMES as DT_FRAMES } from "./dictation/DictationShort";

export const Root: React.FC = () => (
  <>
    <Composition id="Tucky" component={Tucky} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1920} height={1080} />
    <Composition id="NotetakerShort" component={NotetakerShort} durationInFrames={NT_FRAMES} fps={30} width={1080} height={1920} />
    <Composition id="DictationShort" component={DictationShort} durationInFrames={DT_FRAMES} fps={30} width={1080} height={1920} />
    <Still id="ThumbTalk" component={Thumbnail} width={1280} height={720} defaultProps={{ variant: "talk" }} />
    <Still id="ThumbFree" component={Thumbnail} width={1280} height={720} defaultProps={{ variant: "free" }} />
  </>
);
