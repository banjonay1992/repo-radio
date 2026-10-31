/**
 * A tiny SMF reader used only by tests, to check that what we write can be
 * read back as a valid MIDI file.
 */

export interface ReadEvent {
  tick: number;
  type: "noteOn" | "noteOff" | "program" | "meta";
  channel?: number;
  pitch?: number;
  velocity?: number;
  program?: number;
  metaType?: number;
  data?: number[];
}

export interface ReadMidi {
  format: number;
  division: number;
  tracks: ReadEvent[][];
}

export function readMidi(bytes: Uint8Array): ReadMidi {
  let pos = 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const readId = () => String.fromCharCode(...bytes.slice(pos, pos + 4));
  const u32 = () => {
    const v = view.getUint32(pos);
    pos += 4;
    return v;
  };
  const u16 = () => {
    const v = view.getUint16(pos);
    pos += 2;
    return v;
  };
  const vlq = () => {
    let value = 0;
    for (;;) {
      const b = bytes[pos++]!;
      value = (value << 7) | (b & 0x7f);
      if ((b & 0x80) === 0) return value;
    }
  };

  if (readId() !== "MThd") throw new Error("missing MThd");
  pos += 4;
  if (u32() !== 6) throw new Error("bad header length");
  const format = u16();
  const trackCount = u16();
  const division = u16();
  const tracks: ReadEvent[][] = [];

  for (let t = 0; t < trackCount; t++) {
    if (readId() !== "MTrk") throw new Error(`missing MTrk ${t}`);
    pos += 4;
    const length = u32();
    const end = pos + length;
    const events: ReadEvent[] = [];
    let tick = 0;
    let ended = false;
    while (pos < end) {
      tick += vlq();
      const status = bytes[pos++]!;
      if (status === 0xff) {
        const metaType = bytes[pos++]!;
        const len = vlq();
        const data = [...bytes.slice(pos, pos + len)];
        pos += len;
        events.push({ tick, type: "meta", metaType, data });
        if (metaType === 0x2f) ended = true;
      } else if ((status & 0xf0) === 0x90) {
        const pitch = bytes[pos++]!;
        const velocity = bytes[pos++]!;
        events.push({ tick, type: velocity === 0 ? "noteOff" : "noteOn", channel: status & 0x0f, pitch, velocity });
      } else if ((status & 0xf0) === 0x80) {
        const pitch = bytes[pos++]!;
        const velocity = bytes[pos++]!;
        events.push({ tick, type: "noteOff", channel: status & 0x0f, pitch, velocity });
      } else if ((status & 0xf0) === 0xc0) {
        events.push({ tick, type: "program", channel: status & 0x0f, program: bytes[pos++]! });
      } else {
        throw new Error(`unexpected status byte 0x${status.toString(16)} in track ${t}`);
      }
    }
    if (pos !== end) throw new Error(`track ${t} overran its length`);
    if (!ended) throw new Error(`track ${t} has no end-of-track event`);
    tracks.push(events);
  }
  if (pos !== bytes.length) throw new Error("trailing bytes after last track");
  return { format, division, tracks };
}
