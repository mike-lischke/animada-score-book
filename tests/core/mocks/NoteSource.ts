/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

// export class NoteEventSourceMock implements NoteEventSource {
//   requestLog: [number, number][];
//   library:Library;
//
//   constructor(library:Library) {
//     this.requestLog = [];
//     this.library = library;
//   }
//
//   getNoteEvents(interval):NoteEvent[] {
//     this.requestLog.push([interval.start, interval.end]);
//     return [
//       {
//         realTime: 0,
//         note: {
//           timing: '1',
//           instrumentId: 'kick',
//           styleId: 'kick'
//         }
//       }
//     ];
//   }
// }
