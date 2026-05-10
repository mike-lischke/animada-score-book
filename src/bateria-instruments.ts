/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import arrowDownIcon from "./assets/images/icons/arrow_down.svg";
import arrowDownWithLineIcon from "./assets/images/icons/arrow_down_with_line.svg";
import arrowHalfDownIcon from "./assets/images/icons/arrow_half_down.svg";
import arrowHalfUpIcon from "./assets/images/icons/arrow_half_up.svg";
import arrowUpIcon from "./assets/images/icons/arrow_up.svg";
import arrowUpWithLineIcon from "./assets/images/icons/arrow_up_with_line.svg";
import oBigIcon from "./assets/images/icons/o_big.svg";
import oBigClosedIcon from "./assets/images/icons/o_big_closed.svg";
import rimIcon from "./assets/images/icons/rim.svg";
import sunRaysIcon from "./assets/images/icons/sun_rays.svg";
import sunriseRaiseIcon from "./assets/images/icons/sun_rise_rays.svg";
import tripleSlashIcon from "./assets/images/icons/triple_slash.svg";
import xBigIcon from "./assets/images/icons/x_big.svg";
import xSmallIcon from "./assets/images/icons/x_small.svg";

import agogo2Icon from "./assets/images/instrument-icons/agogo-2.svg";
import agogo4Icon from "./assets/images/instrument-icons/agogo-4.svg";
import caixaIcon from "./assets/images/instrument-icons/caixa.svg";
import chocalhoIcon from "./assets/images/instrument-icons/chocalho.svg";
import highSurdoIcon from "./assets/images/instrument-icons/high surdo.svg";
import lowSurdoIcon from "./assets/images/instrument-icons/low surdo.svg";
import midSurdoIcon from "./assets/images/instrument-icons/mid surdo.svg";
import repiStickIcon from "./assets/images/instrument-icons/repi with stick.svg";
import repiWithWhippiesIcon from "./assets/images/instrument-icons/repi with whippies.svg";
import tamborimIcon from "./assets/images/instrument-icons/tamborim.svg";
import timbauIcon from "./assets/images/instrument-icons/timbau.svg";

import {
    Damping, ExcitationMode, HandTechnique, NoteDisplayType, StickTechnique, type IInstrumentMeta
} from "./core/ScoreBookDataModel.js";

export const pastelColors: string[] = [
    "hsl(  0, 100%, 75%)",
    "hsl( 18, 100%, 75%)",
    "hsl( 36, 100%, 75%)",
    "hsl( 54, 100%, 75%)",
    "hsl( 72, 100%, 75%)",
    "hsl( 90, 100%, 75%)",
    "hsl(108, 100%, 75%)",
    "hsl(126, 100%, 75%)",
    "hsl(144, 100%, 75%)",
    "hsl(162, 100%, 75%)",
    "hsl(180, 100%, 75%)",
    "hsl(198, 100%, 75%)",
    "hsl(216, 100%, 75%)",
    "hsl(234, 100%, 75%)",
    "hsl(252, 100%, 75%)",
    "hsl(270, 100%, 75%)",
    "hsl(288, 100%, 75%)",
    "hsl(306, 100%, 75%)",
    "hsl(324, 100%, 75%)",
    "hsl(342, 100%, 75%)",
];

export const bateriaInstruments: IInstrumentMeta[] = [{
    id: 0,
    typeId: "0",
    icon: agogo2Icon,
    displayOrder: 0,
    displayName: "Agogô",
    variants: [
        {
            id: "1",
            file: "Agogo_Low.mp3",
            symbol: {
                src: arrowDownIcon,
                string: "low"
            },
            characteristics: {
                excitationMode: ExcitationMode.Struck,
                stickTechnique: StickTechnique.Normal,
                damping: Damping.Open,
                displayType: NoteDisplayType.Normal
            }
        },
        {
            id: "2",
            file: "Agogo_High.mp3",
            symbol: {
                src: arrowUpIcon,
                string: "high"
            },
            characteristics: {
                excitationMode: ExcitationMode.Struck,
                stickTechnique: StickTechnique.Normal,
                damping: Damping.Open,
                displayType: NoteDisplayType.Normal
            }
        }
    ],
    color: pastelColors[0],
}, {
    id: 10,
    typeId: "a",
    icon: agogo4Icon,
    displayOrder: 1,
    displayName: "4-Bell Agogo",
    variants: [
        {
            id: "1",
            file: "4_Bell_Agogo_Low_Low.mp3",
            symbol: {
                src: arrowDownWithLineIcon,
                string: "low"
            },
            characteristics: {
                excitationMode: ExcitationMode.Struck,
                stickTechnique: StickTechnique.Normal,
                damping: Damping.Open,
                displayType: NoteDisplayType.Normal
            }
        },
        {
            id: "2",
            file: "4_Bell_Agogo_Low.mp3",
            symbol: {
                src: arrowHalfDownIcon,
                string: "high"
            },
            characteristics: {
                excitationMode: ExcitationMode.Struck,
                stickTechnique: StickTechnique.Normal,
                damping: Damping.Open,
                displayType: NoteDisplayType.Normal
            }
        },
        {
            id: "3",
            file: "4_Bell_Agogo_High.mp3",
            symbol: {
                src: arrowHalfUpIcon,
                string: "low"
            },
            characteristics: {
                excitationMode: ExcitationMode.Struck,
                stickTechnique: StickTechnique.Normal,
                damping: Damping.Open,
                displayType: NoteDisplayType.Normal
            }
        },
        {
            id: "4",
            file: "4_Bell_Agogo_High_High.mp3",
            symbol: {
                src: arrowUpWithLineIcon,
                string: "high"
            },
            characteristics: {
                excitationMode: ExcitationMode.Struck,
                stickTechnique: StickTechnique.Normal,
                damping: Damping.Open,
                displayType: NoteDisplayType.Normal
            }
        }
    ],
    color: pastelColors[1],
}, {
    id: 1,
    typeId: "1",
    icon: chocalhoIcon,
    displayOrder: 2,
    displayName: "Chocalho",
    variants: [
        {
            id: "1",
            file: "Chocalho_Accent.mp3",
            symbol: {
                src: xBigIcon,
                string: "accent"
            },
            characteristics: {
                excitationMode: ExcitationMode.Shaken,
                displayType: NoteDisplayType.Cross
            }
        },
        {
            id: "2",
            file: "Chocalho_Ghost.mp3",
            symbol: {
                src: xSmallIcon,
                string: "ghost"
            },
            characteristics: {
                excitationMode: ExcitationMode.Shaken,
                displayType: NoteDisplayType.Cross
            }
        }
    ],
    color: pastelColors[2]
}, {
    id: 2,
    typeId: "2",
    icon: tamborimIcon,
    displayOrder: 3,
    displayName: "Tamborim",
    variants: [
        {
            id: "1",
            file: "Tamborim_Accent.mp3",
            symbol: {
                src: xBigIcon,
                string: "accent"
            },
            characteristics: {
                excitationMode: ExcitationMode.Struck,
                stickTechnique: StickTechnique.Normal,
                damping: Damping.Open,
                displayType: NoteDisplayType.Normal
            }
        },
        {
            id: "2",
            file: "Tamborim_Ghost.mp3",
            symbol: {
                src: xSmallIcon,
                string: "ghost"
            },
            characteristics: {
                excitationMode: ExcitationMode.Struck,
                stickTechnique: StickTechnique.Normal,
                damping: Damping.Open,
                displayType: NoteDisplayType.Normal
            }
        }
    ],
    color: pastelColors[3]
}, {
    id: 3,
    typeId: "3",
    icon: repiStickIcon,
    displayOrder: 4,
    displayName: "Repinique",
    variants: [
        {
            id: "1",
            file: "Repinique_Center.mp3",
            symbol: {
                src: xBigIcon,
                string: "center"
            },
            characteristics: {
                excitationMode: ExcitationMode.Struck,
                stickTechnique: StickTechnique.Normal,
                damping: Damping.Open,
                displayType: NoteDisplayType.Normal
            }
        },
        {
            id: "2",
            file: "Repinique_Edge.mp3",
            symbol: {
                src: xSmallIcon,
                string: "edge"
            },
            characteristics: {
                excitationMode: ExcitationMode.Struck,
                stickTechnique: StickTechnique.Normal,
                damping: Damping.Open,
                displayType: NoteDisplayType.Normal
            }
        },
        {
            id: "3",
            file: "Repinique_Rimshot.mp3",
            symbol: {
                src: sunriseRaiseIcon,
                string: "rimshot"
            },
            characteristics: {
                excitationMode: ExcitationMode.Struck,
                stickTechnique: StickTechnique.RimShot,
                damping: Damping.Open,
                displayType: NoteDisplayType.Cross
            }
        },
        {
            id: "4",
            file: "Repinique_Rim.mp3",
            symbol: {
                src: rimIcon,
                string: "rim"
            },
            characteristics: {
                excitationMode: ExcitationMode.Struck,
                stickTechnique: StickTechnique.Rim,
                damping: Damping.Open,
                displayType: NoteDisplayType.Cross
            }
        },
        {
            id: "5",
            file: "Repinique_Buzz.mp3",
            symbol: {
                src: tripleSlashIcon,
                string: "buzz"
            },
            characteristics: {
                excitationMode: ExcitationMode.Struck,
                stickTechnique: StickTechnique.PressRoll,
                damping: Damping.Open,
                displayType: NoteDisplayType.Normal
            }
        },
        {
            id: "6",
            file: "Repinique_Hand.mp3",
            symbol: {
                src: oBigIcon,
                string: "hand"
            },
            characteristics: {
                excitationMode: ExcitationMode.Struck,
                handTechnique: HandTechnique.Open,
                damping: Damping.Open,
                displayType: NoteDisplayType.Normal
            }
        },
        {
            id: "7",
            file: "Repinique_Slap.mp3",
            symbol: {
                src: sunRaysIcon,
                string: "slap"
            },
            characteristics: {
                excitationMode: ExcitationMode.Struck,
                handTechnique: HandTechnique.Slap,
                damping: Damping.Open,
                displayType: NoteDisplayType.Normal
            }
        }
    ],
    color: pastelColors[4]
}, {
    id: 4,
    typeId: "4",
    icon: repiWithWhippiesIcon,
    displayOrder: 5,
    displayName: "Repinique (Whippy Sticks)",
    variants: [
        {
            id: "1",
            file: "Repinique_Whippy_Accent.mp3",
            symbol: {
                src: xBigIcon,
                string: "accent"
            },
            characteristics: {
                excitationMode: ExcitationMode.Struck,
                stickTechnique: StickTechnique.Normal,
                damping: Damping.Open,
                displayType: NoteDisplayType.Normal
            }
        },
        {
            id: "2",
            file: "Repinique_Whippy_Ghost.mp3",
            symbol: {
                src: xSmallIcon,
                string: "ghost"
            },
            characteristics: {
                excitationMode: ExcitationMode.Struck,
                stickTechnique: StickTechnique.Normal,
                damping: Damping.Open,
                displayType: NoteDisplayType.Normal
            }
        }
    ],
    color: pastelColors[5]
}, {
    id: 5,
    typeId: "5",
    icon: caixaIcon,
    displayOrder: 6,
    displayName: "Caixa",
    variants: [
        {
            id: "1",
            file: "Caixa_Accent.mp3",
            symbol: {
                src: xBigIcon,
                string: "accent"
            },
            characteristics: {
                excitationMode: ExcitationMode.Struck,
                stickTechnique: StickTechnique.Normal,
                damping: Damping.Open,
                displayType: NoteDisplayType.Normal
            }
        },
        {
            id: "2",
            file: "Caixa_Ghost.mp3",
            symbol: {
                src: xSmallIcon,
                string: "ghost"
            },
            characteristics: {
                excitationMode: ExcitationMode.Struck,
                stickTechnique: StickTechnique.Normal,
                damping: Damping.Open,
                displayType: NoteDisplayType.Normal
            }
        },
        {
            id: "3",
            file: "Caixa_Buzz.mp3",
            symbol: {
                src: tripleSlashIcon,
                string: "buzz"
            },
            characteristics: {
                excitationMode: ExcitationMode.Struck,
                stickTechnique: StickTechnique.PressRoll,
                damping: Damping.Open,
                displayType: NoteDisplayType.Normal
            }
        },
        {
            id: "4",
            file: "Caixa_Rimshot.mp3",
            symbol: {
                src: sunriseRaiseIcon,
                string: "rimshot"
            },
            characteristics: {
                excitationMode: ExcitationMode.Struck,
                stickTechnique: StickTechnique.RimShot,
                damping: Damping.Open,
                displayType: NoteDisplayType.Cross
            }
        },
    ],
    color: pastelColors[6]
}, {
    id: 6,
    typeId: "6",
    icon: timbauIcon,
    displayOrder: 7,
    displayName: "Timbau",
    variants: [
        {
            id: "1",
            file: "Timbau_Open.mp3",
            symbol: {
                src: oBigIcon,
                string: "open"
            },
            characteristics: {
                excitationMode: ExcitationMode.Struck,
                handTechnique: HandTechnique.Open,
                damping: Damping.Open,
                displayType: NoteDisplayType.Normal
            }
        },
        {
            id: "2",
            file: "Timbau_Slap.mp3",
            symbol: {
                src: sunRaysIcon,
                string: "slap"
            },
            characteristics: {
                excitationMode: ExcitationMode.Struck,
                handTechnique: HandTechnique.Slap,
                damping: Damping.Open,
                displayType: NoteDisplayType.Normal
            }
        },
        {
            id: "3",
            file: "Timbau_Bass.mp3",
            symbol: {
                src: oBigClosedIcon,
                string: "bass"
            },
            characteristics: {
                excitationMode: ExcitationMode.Struck,
                handTechnique: HandTechnique.Heel,
                damping: Damping.Open,
                displayType: NoteDisplayType.Normal
            }
        }
    ],
    color: pastelColors[7]
}, {
    id: 7,
    typeId: "7",
    icon: highSurdoIcon,
    displayOrder: 8,
    displayName: "High Surdo",
    variants: [
        {
            id: "1",
            file: "High_Surdo_Accent.mp3",
            symbol: {
                src: oBigIcon,
                string: "accent"
            },
            characteristics: {
                excitationMode: ExcitationMode.Struck,
                stickTechnique: StickTechnique.Normal,
                damping: Damping.Open,
                displayType: NoteDisplayType.Normal
            }
        },
        {
            id: "2",
            file: "High_Surdo_Muted.mp3",
            symbol: {
                src: oBigClosedIcon,
                string: "muted"
            },
            characteristics: {
                excitationMode: ExcitationMode.Struck,
                stickTechnique: StickTechnique.Normal,
                damping: Damping.Muted,
                displayType: NoteDisplayType.Normal
            }
        }
    ],
    color: pastelColors[8]
}, {
    id: 8,
    typeId: "8",
    icon: midSurdoIcon,
    displayOrder: 9,
    displayName: "Mid Surdo",
    variants: [
        {
            id: "1",
            file: "Mid_Surdo_Accent.mp3",
            symbol: {
                src: oBigIcon,
                string: "accent"
            },
            characteristics: {
                excitationMode: ExcitationMode.Struck,
                stickTechnique: StickTechnique.Normal,
                damping: Damping.Open,
                displayType: NoteDisplayType.Normal
            }
        },
        {
            id: "2",
            file: "Mid_Surdo_Muted.mp3",
            symbol: {
                src: oBigClosedIcon,
                string: "muted"
            },
            characteristics: {
                excitationMode: ExcitationMode.Struck,
                stickTechnique: StickTechnique.Normal,
                damping: Damping.Muted,
                displayType: NoteDisplayType.Normal
            }
        }
    ],
    color: pastelColors[9]
}, {
    id: 9,
    typeId: "9",
    icon: lowSurdoIcon,
    displayOrder: 10,
    displayName: "Low Surdo",
    variants: [
        {
            id: "1",
            file: "Low_Surdo_Accent.mp3",
            symbol: {
                src: oBigIcon,
                string: "accent"
            },
            characteristics: {
                excitationMode: ExcitationMode.Struck,
                stickTechnique: StickTechnique.Normal,
                damping: Damping.Open,
                displayType: NoteDisplayType.Normal
            }
        },
        {
            id: "2",
            file: "Low_Surdo_Muted.mp3",
            symbol: {
                src: oBigClosedIcon,
                string: "muted"
            },
            characteristics: {
                excitationMode: ExcitationMode.Struck,
                stickTechnique: StickTechnique.Normal,
                damping: Damping.Muted,
                displayType: NoteDisplayType.Normal
            }
        }
    ],
    color: pastelColors[10]
}];
