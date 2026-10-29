export type LanguageLevel = 'L1' | 'L2' | 'L3';

export type SfxType =
  | 'pop'
  | 'valve'
  | 'splash'
  | 'dig'
  | 'hydraulic'
  | 'crane'
  | 'mix'
  | 'engine'
  | 'horn'
  | 'wheel'
  | 'light'
  | 'eye_giggle'
  | 'bloom_chime'
  | 'treasure_fanfare'
  | 'dump_whoosh'
  | 'build_tada'
  | 'star_magic'
  | 'clear_cheer';

export interface VoiceStageLines {
  promptId: string;
  prompt: string;       // 操作前：引导祈使句
  actionWordId: string;
  actionWord: string;   // 操作中：拟声词与短语伴读
  completeId: string;
  complete: string;     // 操作后：结果状态描述句
}

export interface VoiceLines {
  L1: VoiceStageLines;
  L2: VoiceStageLines;
  L3: VoiceStageLines;
}

export interface InteractionStepConfig {
  stepId: string;
  targetPartId: string;
  /** 统一采用指定方向拖拽作为教学手势 */
  gestureType: 'DRAG_DIRECTION';
  /** 开启单指点击兜底：幼儿轻点 (<400ms) 也可自动吸附完成动作 */
  allowTapFallback: boolean;
  /** 期望屏幕滑动方向单位向量 [dx, dy]，x向右为正，y向下为正 */
  dragDirectionScreen: [number, number];
  /** 触发自动吸附完成的进度阈值 (默认 0.30) */
  autoSnapThreshold: number;
  sfxOnStart: SfxType;
  sfxOnComplete: SfxType;
  voice: VoiceLines;
}

export interface FreePlayPartConfig {
  partId: string;
  partNameEn: string;
  sfxType: SfxType;
  /** 自由探索部件在幼儿点击后触发，因此全部为【结果描述句】，绝不使用命令祈使句 */
  resultVoice: {
    L1: { id: string; text: string };
    L2: { id: string; text: string };
    L3: { id: string; text: string };
  };
}

export interface VehicleScenarioConfig {
  id: 'water_truck' | 'excavator' | 'dump_truck' | 'crane_truck' | 'cement_mixer' | 'bulldozer';
  nameEn: string;
  themeColorHex: string;
  accentColorHex: string;
  groundColorHex: string;
  introVoice: {
    L1: { id: string; text: string };
    L2: { id: string; text: string };
    L3: { id: string; text: string };
  };
  chantVoice: { id: string; text: string };
  steps: InteractionStepConfig[];
  freePlayParts: FreePlayPartConfig[];
}

export const VEHICLES_CONFIG: VehicleScenarioConfig[] = [
  {
    id: 'water_truck',
    nameEn: 'Water Truck',
    themeColorHex: '#38BDF8',
    accentColorHex: '#FACC15',
    groundColorHex: '#E6CCB2',
    introVoice: {
      L1: { id: 'wt_intro_l1', text: 'Water truck! Splash, splash!' },
      L2: { id: 'wt_intro_l2', text: 'Here comes the water truck! Let us water the flowers!' },
      L3: { id: 'wt_intro_l3', text: 'Hello, little water truck! The garden is thirsty today!' }
    },
    chantVoice: {
      id: 'wt_chant',
      text: 'Spray, spray, spray the water! Splash, splash, bloom the flowers!'
    },
    steps: [
      {
        stepId: 'wt_step_1_valve',
        targetPartId: 'part_valve',
        gestureType: 'DRAG_DIRECTION',
        allowTapFallback: true,
        dragDirectionScreen: [1, 0],
        autoSnapThreshold: 0.30,
        sfxOnStart: 'valve',
        sfxOnComplete: 'star_magic',
        voice: {
          L1: {
            promptId: 'wt_s1_p_l1', prompt: 'Water! Turn!',
            actionWordId: 'wt_s1_a_l1', actionWord: 'Turn! Glug, glug!',
            completeId: 'wt_s1_c_l1', complete: 'Full of water!'
          },
          L2: {
            promptId: 'wt_s1_p_l2', prompt: 'Turn on the valve! Fill the tank!',
            actionWordId: 'wt_s1_a_l2', actionWord: 'Filling it up!',
            completeId: 'wt_s1_c_l2', complete: 'Great! The water tank is full!'
          },
          L3: {
            promptId: 'wt_s1_p_l3', prompt: 'The tank is empty! Turn the red valve to fill it with water!',
            actionWordId: 'wt_s1_a_l3', actionWord: 'Water is flowing into the tank!',
            completeId: 'wt_s1_c_l3', complete: 'Look! The little yellow duck is floating in the water!'
          }
        }
      },
      {
        stepId: 'wt_step_2_spray',
        targetPartId: 'part_cannon',
        gestureType: 'DRAG_DIRECTION',
        allowTapFallback: true,
        dragDirectionScreen: [0.85, -0.5],
        autoSnapThreshold: 0.30,
        sfxOnStart: 'splash',
        sfxOnComplete: 'star_magic',
        voice: {
          L1: {
            promptId: 'wt_s2_p_l1', prompt: 'Water! Spray!',
            actionWordId: 'wt_s2_a_l1', actionWord: 'Splash, splash!',
            completeId: 'wt_s2_c_l1', complete: 'Wet dirt!'
          },
          L2: {
            promptId: 'wt_s2_p_l2', prompt: 'Slide the water cannon! Spray the water!',
            actionWordId: 'wt_s2_a_l2', actionWord: 'Spraying the water!',
            completeId: 'wt_s2_c_l2', complete: 'Good job! The dry soil is wet now!'
          },
          L3: {
            promptId: 'wt_s2_p_l3', prompt: 'Aim the white water cannon and spray water on the dry soil!',
            actionWordId: 'wt_s2_a_l3', actionWord: 'Cool water is splashing down!',
            completeId: 'wt_s2_c_l3', complete: 'The thirsty brown soil is nice and wet now!'
          }
        }
      },
      {
        stepId: 'wt_step_3_bloom',
        targetPartId: 'part_cannon',
        gestureType: 'DRAG_DIRECTION',
        allowTapFallback: true,
        dragDirectionScreen: [0.85, 0.25],
        autoSnapThreshold: 0.30,
        sfxOnStart: 'splash',
        sfxOnComplete: 'bloom_chime',
        voice: {
          L1: {
            promptId: 'wt_s3_p_l1', prompt: 'Flower! Grow!',
            actionWordId: 'wt_s3_a_l1', actionWord: 'Splash! Grow, grow!',
            completeId: 'wt_s3_c_l1', complete: 'Flowers! Yay!'
          },
          L2: {
            promptId: 'wt_s3_p_l2', prompt: 'Water the seeds! Make the flowers bloom!',
            actionWordId: 'wt_s3_a_l2', actionWord: 'The seeds are sprouting!',
            completeId: 'wt_s3_c_l2', complete: 'Wow! The flowers are blooming!'
          },
          L3: {
            promptId: 'wt_s3_p_l3', prompt: 'Spray one more time to help the little seeds grow into flowers!',
            actionWordId: 'wt_s3_a_l3', actionWord: 'Little green sprouts are growing up fast!',
            completeId: 'wt_s3_c_l3', complete: 'Look! Colorful flowers are blooming everywhere! So pretty!'
          }
        }
      }
    ],
    freePlayParts: [
      {
        partId: 'fp_horn',
        partNameEn: 'Horn',
        sfxType: 'horn',
        resultVoice: {
          L1: { id: 'wt_fp_horn_l1', text: 'Beep, beep! Horn!' },
          L2: { id: 'wt_fp_horn_l2', text: 'Beep, beep! The horn goes beep beep!' },
          L3: { id: 'wt_fp_horn_l3', text: 'Beep, beep! The water truck horn sounds so happy!' }
        }
      },
      {
        partId: 'fp_wheels',
        partNameEn: 'Wheels',
        sfxType: 'wheel',
        resultVoice: {
          L1: { id: 'wt_fp_wheel_l1', text: 'Wheels! Roll, roll!' },
          L2: { id: 'wt_fp_wheel_l2', text: 'Roll, roll! The big wheels are spinning!' },
          L3: { id: 'wt_fp_wheel_l3', text: 'Round and round! The big black wheels roll so fast!' }
        }
      },
      {
        partId: 'fp_eyes',
        partNameEn: 'Eyes',
        sfxType: 'eye_giggle',
        resultVoice: {
          L1: { id: 'wt_fp_eye_l1', text: 'Blink, blink! Eyes!' },
          L2: { id: 'wt_fp_eye_l2', text: 'Blink, blink! Big bright eyes!' },
          L3: { id: 'wt_fp_eye_l3', text: 'Hehe! The water truck is blinking its big eyes at you!' }
        }
      }
    ]
  },
  {
    id: 'excavator',
    nameEn: 'Excavator',
    themeColorHex: '#F59E0B',
    accentColorHex: '#EA580C',
    groundColorHex: '#D6B88E',
    introVoice: {
      L1: { id: 'ex_intro_l1', text: 'Excavator! Dig, dig!' },
      L2: { id: 'ex_intro_l2', text: 'Here comes the excavator! Let us dig the dirt!' },
      L3: { id: 'ex_intro_l3', text: 'The strong excavator is ready to dig for hidden treasure!' }
    },
    chantVoice: {
      id: 'ex_chant',
      text: 'Dig, dig, dig the dirt! Scoop it up and lift it high!'
    },
    steps: [
      {
        stepId: 'ex_step_1_door',
        targetPartId: 'part_door',
        gestureType: 'DRAG_DIRECTION',
        allowTapFallback: true,
        dragDirectionScreen: [-1, 0],
        autoSnapThreshold: 0.30,
        sfxOnStart: 'pop',
        sfxOnComplete: 'star_magic',
        voice: {
          L1: {
            promptId: 'ex_s1_p_l1', prompt: 'Door! Open!',
            actionWordId: 'ex_s1_a_l1', actionWord: 'Click! Open!',
            completeId: 'ex_s1_c_l1', complete: 'Hello, bear!'
          },
          L2: {
            promptId: 'ex_s1_p_l2', prompt: 'Open the door, please!',
            actionWordId: 'ex_s1_a_l2', actionWord: 'Opening the door!',
            completeId: 'ex_s1_c_l2', complete: 'Click! The door is open!'
          },
          L3: {
            promptId: 'ex_s1_p_l3', prompt: 'Pull the orange cab door to say hello to the driver!',
            actionWordId: 'ex_s1_a_l3', actionWord: 'The cab door is swinging open!',
            completeId: 'ex_s1_c_l3', complete: 'The door is open! Little bear is waving at you!'
          }
        }
      },
      {
        stepId: 'ex_step_2_dig',
        targetPartId: 'part_bucket_arm',
        gestureType: 'DRAG_DIRECTION',
        allowTapFallback: true,
        dragDirectionScreen: [0.6, 0.8],
        autoSnapThreshold: 0.30,
        sfxOnStart: 'dig',
        sfxOnComplete: 'star_magic',
        voice: {
          L1: {
            promptId: 'ex_s2_p_l1', prompt: 'Dirt! Dig, dig!',
            actionWordId: 'ex_s2_a_l1', actionWord: 'Scoop! Dig!',
            completeId: 'ex_s2_c_l1', complete: 'Big scoop!'
          },
          L2: {
            promptId: 'ex_s2_p_l2', prompt: 'Lower the arm! Dig the dirt!',
            actionWordId: 'ex_s2_a_l2', actionWord: 'Digging the dirt!',
            completeId: 'ex_s2_c_l2', complete: 'Awesome! A big scoop of dirt!'
          },
          L3: {
            promptId: 'ex_s2_p_l3', prompt: 'Pull the big bucket down to dig deep into the dirt pile!',
            actionWordId: 'ex_s2_a_l3', actionWord: 'The strong bucket is scooping the dirt!',
            completeId: 'ex_s2_c_l3', complete: 'Look! Something shiny is hiding under the dirt!'
          }
        }
      },
      {
        stepId: 'ex_step_3_lift',
        targetPartId: 'part_bucket_arm',
        gestureType: 'DRAG_DIRECTION',
        allowTapFallback: true,
        dragDirectionScreen: [-0.25, -0.95],
        autoSnapThreshold: 0.30,
        sfxOnStart: 'hydraulic',
        sfxOnComplete: 'treasure_fanfare',
        voice: {
          L1: {
            promptId: 'ex_s3_p_l1', prompt: 'Up, up! Treasure!',
            actionWordId: 'ex_s3_a_l1', actionWord: 'Lifting up!',
            completeId: 'ex_s3_c_l1', complete: 'Treasure box! Yay!'
          },
          L2: {
            promptId: 'ex_s3_p_l2', prompt: 'Lift the bucket up! Get the treasure!',
            actionWordId: 'ex_s3_a_l2', actionWord: 'Lifting it high!',
            completeId: 'ex_s3_c_l2', complete: 'Hooray! You found a golden treasure box!'
          },
          L3: {
            promptId: 'ex_s3_p_l3', prompt: 'Slide the arm up high to lift the shiny treasure box out!',
            actionWordId: 'ex_s3_a_l3', actionWord: 'Up goes the heavy bucket!',
            completeId: 'ex_s3_c_l3', complete: 'Wow! The treasure box popped open with sparkling gems!'
          }
        }
      }
    ],
    freePlayParts: [
      {
        partId: 'fp_horn',
        partNameEn: 'Horn',
        sfxType: 'horn',
        resultVoice: {
          L1: { id: 'ex_fp_horn_l1', text: 'Honk, honk! Horn!' },
          L2: { id: 'ex_fp_horn_l2', text: 'Honk, honk! The horn goes honk honk!' },
          L3: { id: 'ex_fp_horn_l3', text: 'Honk, honk! That is a loud excavator horn!' }
        }
      },
      {
        partId: 'fp_wheels',
        partNameEn: 'Tracks',
        sfxType: 'wheel',
        resultVoice: {
          L1: { id: 'ex_fp_wheel_l1', text: 'Tracks! Clack, clack!' },
          L2: { id: 'ex_fp_wheel_l2', text: 'Clack, clack! The strong tracks are moving!' },
          L3: { id: 'ex_fp_wheel_l3', text: 'Clack, clack! Caterpillar tracks can climb over bumpy dirt!' }
        }
      },
      {
        partId: 'fp_eyes',
        partNameEn: 'Eyes',
        sfxType: 'eye_giggle',
        resultVoice: {
          L1: { id: 'ex_fp_eye_l1', text: 'Wink, wink! Eyes!' },
          L2: { id: 'ex_fp_eye_l2', text: 'Wink, wink! Happy excavator eyes!' },
          L3: { id: 'ex_fp_eye_l3', text: 'Hehe! The excavator loves digging with you!' }
        }
      }
    ]
  },
  {
    id: 'dump_truck',
    nameEn: 'Dump Truck',
    themeColorHex: '#22C55E',
    accentColorHex: '#EAB308',
    groundColorHex: '#FDE68A',
    introVoice: {
      L1: { id: 'dt_intro_l1', text: 'Dump truck! Vroom!' },
      L2: { id: 'dt_intro_l2', text: 'Here is the dump truck! Let us carry and dump!' },
      L3: { id: 'dt_intro_l3', text: 'The big dump truck is here to fill the playground pit!' }
    },
    chantVoice: {
      id: 'dt_chant',
      text: 'Load it up, tilt the bed! Whoosh goes the sand down below!'
    },
    steps: [
      {
        stepId: 'dt_step_1_light',
        targetPartId: 'part_headlights',
        gestureType: 'DRAG_DIRECTION',
        allowTapFallback: true,
        dragDirectionScreen: [1, 0],
        autoSnapThreshold: 0.30,
        sfxOnStart: 'light',
        sfxOnComplete: 'star_magic',
        voice: {
          L1: {
            promptId: 'dt_s1_p_l1', prompt: 'Light! On!',
            actionWordId: 'dt_s1_a_l1', actionWord: 'Bling! Bright!',
            completeId: 'dt_s1_c_l1', complete: 'Lights on!'
          },
          L2: {
            promptId: 'dt_s1_p_l2', prompt: 'Turn on the headlights!',
            actionWordId: 'dt_s1_a_l2', actionWord: 'Lights are turning on!',
            completeId: 'dt_s1_c_l2', complete: 'Shining bright! The headlights are on!'
          },
          L3: {
            promptId: 'dt_s1_p_l3', prompt: 'Slide the round headlights on the front to light up the way!',
            actionWordId: 'dt_s1_a_l3', actionWord: 'Switching on the bright beams!',
            completeId: 'dt_s1_c_l3', complete: 'Both headlights are glowing warm and bright!'
          }
        }
      },
      {
        stepId: 'dt_step_2_load',
        targetPartId: 'part_hopper_lever',
        gestureType: 'DRAG_DIRECTION',
        allowTapFallback: true,
        dragDirectionScreen: [0, 1],
        autoSnapThreshold: 0.30,
        sfxOnStart: 'dig',
        sfxOnComplete: 'star_magic',
        voice: {
          L1: {
            promptId: 'dt_s2_p_l1', prompt: 'Balls! Sand! Down!',
            actionWordId: 'dt_s2_a_l1', actionWord: 'Rumble! Pouring in!',
            completeId: 'dt_s2_c_l1', complete: 'All full!'
          },
          L2: {
            promptId: 'dt_s2_p_l2', prompt: 'Pull the lever down! Fill the dump bed!',
            actionWordId: 'dt_s2_a_l2', actionWord: 'Loading the truck bed!',
            completeId: 'dt_s2_c_l2', complete: 'The dump bed is full of colorful balls!'
          },
          L3: {
            promptId: 'dt_s2_p_l3', prompt: 'Pull the hopper lever down to pour golden sand and bouncy balls in!',
            actionWordId: 'dt_s2_a_l3', actionWord: 'Sand and balls are pouring down!',
            completeId: 'dt_s2_c_l3', complete: 'Look! So many colorful balls are inside the truck!'
          }
        }
      },
      {
        stepId: 'dt_step_3_dump',
        targetPartId: 'part_dump_bed',
        gestureType: 'DRAG_DIRECTION',
        allowTapFallback: true,
        dragDirectionScreen: [0.3, -0.95],
        autoSnapThreshold: 0.30,
        sfxOnStart: 'hydraulic',
        sfxOnComplete: 'dump_whoosh',
        voice: {
          L1: {
            promptId: 'dt_s3_p_l1', prompt: 'Tilt! Dump!',
            actionWordId: 'dt_s3_a_l1', actionWord: 'Up, up! Whoosh!',
            completeId: 'dt_s3_c_l1', complete: 'All down! Yay!'
          },
          L2: {
            promptId: 'dt_s3_p_l2', prompt: 'Tilt the bed up! Dump it out!',
            actionWordId: 'dt_s3_a_l2', actionWord: 'Dumping the sand!',
            completeId: 'dt_s3_c_l2', complete: 'Whoosh! The playground pit is full!'
          },
          L3: {
            promptId: 'dt_s3_p_l3', prompt: 'Slide the yellow bed up to dump all the balls into the pit!',
            actionWordId: 'dt_s3_a_l3', actionWord: 'Tilting the big bed up high!',
            completeId: 'dt_s3_c_l3', complete: 'Hooray! All the sand and balls tumbled into the playground!'
          }
        }
      }
    ],
    freePlayParts: [
      {
        partId: 'fp_horn',
        partNameEn: 'Horn',
        sfxType: 'horn',
        resultVoice: {
          L1: { id: 'dt_fp_horn_l1', text: 'Beep, beep! Horn!' },
          L2: { id: 'dt_fp_horn_l2', text: 'Beep, beep! The dump truck horn goes beep!' },
          L3: { id: 'dt_fp_horn_l3', text: 'Beep, beep! Big load coming through!' }
        }
      },
      {
        partId: 'fp_wheels',
        partNameEn: 'Wheels',
        sfxType: 'wheel',
        resultVoice: {
          L1: { id: 'dt_fp_wheel_l1', text: 'Big wheels! Bounce!' },
          L2: { id: 'dt_fp_wheel_l2', text: 'Boing, boing! The big red wheels are bouncy!' },
          L3: { id: 'dt_fp_wheel_l3', text: 'Big bouncy tires carry heavy loads so easily!' }
        }
      },
      {
        partId: 'fp_eyes',
        partNameEn: 'Eyes',
        sfxType: 'eye_giggle',
        resultVoice: {
          L1: { id: 'dt_fp_eye_l1', text: 'Hello! Happy eyes!' },
          L2: { id: 'dt_fp_eye_l2', text: 'Wink, wink! The dump truck is smiling!' },
          L3: { id: 'dt_fp_eye_l3', text: 'The dump truck is winking its bright eyes at you!' }
        }
      }
    ]
  },
  {
    id: 'crane_truck',
    nameEn: 'Crane Truck',
    themeColorHex: '#F97316',
    accentColorHex: '#3B82F6',
    groundColorHex: '#BBF7D0',
    introVoice: {
      L1: { id: 'ct_intro_l1', text: 'Crane! Reach high!' },
      L2: { id: 'ct_intro_l2', text: 'Here comes the crane truck! Let us build a house!' },
      L3: { id: 'ct_intro_l3', text: 'The tall crane truck has a long arm to lift heavy things!' }
    },
    chantVoice: {
      id: 'ct_chant',
      text: 'Stretch the arm, hook it tight! Lift it up into the sky!'
    },
    steps: [
      {
        stepId: 'ct_step_1_legs',
        targetPartId: 'part_outriggers',
        gestureType: 'DRAG_DIRECTION',
        allowTapFallback: true,
        dragDirectionScreen: [0, 1],
        autoSnapThreshold: 0.30,
        sfxOnStart: 'hydraulic',
        sfxOnComplete: 'star_magic',
        voice: {
          L1: {
            promptId: 'ct_s1_p_l1', prompt: 'Legs! Down!',
            actionWordId: 'ct_s1_a_l1', actionWord: 'Clank! Steady!',
            completeId: 'ct_s1_c_l1', complete: 'Strong legs!'
          },
          L2: {
            promptId: 'ct_s1_p_l2', prompt: 'Put down the legs! Make it steady!',
            actionWordId: 'ct_s1_a_l2', actionWord: 'Putting the legs down!',
            completeId: 'ct_s1_c_l2', complete: 'Great! The crane is standing steady!'
          },
          L3: {
            promptId: 'ct_s1_p_l3', prompt: 'Push the yellow support legs down so the crane will not wobble!',
            actionWordId: 'ct_s1_a_l3', actionWord: 'Extending all four support legs!',
            completeId: 'ct_s1_c_l3', complete: 'All four legs are holding the ground tightly!'
          }
        }
      },
      {
        stepId: 'ct_step_2_stretch',
        targetPartId: 'part_crane_boom',
        gestureType: 'DRAG_DIRECTION',
        allowTapFallback: true,
        dragDirectionScreen: [0.7, -0.7],
        autoSnapThreshold: 0.30,
        sfxOnStart: 'crane',
        sfxOnComplete: 'star_magic',
        voice: {
          L1: {
            promptId: 'ct_s2_p_l1', prompt: 'Arm! Stretch!',
            actionWordId: 'ct_s2_a_l1', actionWord: 'Long arm! Hook!',
            completeId: 'ct_s2_c_l1', complete: 'Got the roof!'
          },
          L2: {
            promptId: 'ct_s2_p_l2', prompt: 'Stretch the long arm! Hook the roof!',
            actionWordId: 'ct_s2_a_l2', actionWord: 'Stretching and hooking!',
            completeId: 'ct_s2_c_l2', complete: 'Click! The hook caught the red roof!'
          },
          L3: {
            promptId: 'ct_s2_p_l3', prompt: 'Slide the crane arm out to hook the red triangle roof!',
            actionWordId: 'ct_s2_a_l3', actionWord: 'The long boom is reaching out!',
            completeId: 'ct_s2_c_l3', complete: 'The strong magnet hook picked up the roof!'
          }
        }
      },
      {
        stepId: 'ct_step_3_build',
        targetPartId: 'part_crane_boom',
        gestureType: 'DRAG_DIRECTION',
        allowTapFallback: true,
        dragDirectionScreen: [0.8, -0.6],
        autoSnapThreshold: 0.30,
        sfxOnStart: 'crane',
        sfxOnComplete: 'build_tada',
        voice: {
          L1: {
            promptId: 'ct_s3_p_l1', prompt: 'House! Put it on!',
            actionWordId: 'ct_s3_a_l1', actionWord: 'Lifting! Bam!',
            completeId: 'ct_s3_c_l1', complete: 'Nice house!'
          },
          L2: {
            promptId: 'ct_s3_p_l2', prompt: 'Lift the roof! Build the treehouse!',
            actionWordId: 'ct_s3_a_l2', actionWord: 'Placing the roof on top!',
            completeId: 'ct_s3_c_l2', complete: 'Ta-da! The treehouse is ready!'
          },
          L3: {
            promptId: 'ct_s3_p_l3', prompt: 'Move the crane arm over to place the roof on top of the house!',
            actionWordId: 'ct_s3_a_l3', actionWord: 'Carefully lowering the roof!',
            completeId: 'ct_s3_c_l3', complete: 'Wonderful! The warm lights are on inside the new treehouse!'
          }
        }
      }
    ],
    freePlayParts: [
      {
        partId: 'fp_horn',
        partNameEn: 'Horn',
        sfxType: 'horn',
        resultVoice: {
          L1: { id: 'ct_fp_horn_l1', text: 'Toot, toot! Horn!' },
          L2: { id: 'ct_fp_horn_l2', text: 'Toot, toot! The crane horn goes toot!' },
          L3: { id: 'ct_fp_horn_l3', text: 'Toot, toot! The tall crane is saying hello!' }
        }
      },
      {
        partId: 'fp_wheels',
        partNameEn: 'Wheels',
        sfxType: 'wheel',
        resultVoice: {
          L1: { id: 'ct_fp_wheel_l1', text: 'Wheels! Roll, roll!' },
          L2: { id: 'ct_fp_wheel_l2', text: 'Roll, roll! The crane wheels are turning!' },
          L3: { id: 'ct_fp_wheel_l3', text: 'Strong wheels carry the long crane arm everywhere!' }
        }
      },
      {
        partId: 'fp_eyes',
        partNameEn: 'Eyes',
        sfxType: 'eye_giggle',
        resultVoice: {
          L1: { id: 'ct_fp_eye_l1', text: 'Look up! Eyes!' },
          L2: { id: 'ct_fp_eye_l2', text: 'Blink, blink! Big bright crane eyes!' },
          L3: { id: 'ct_fp_eye_l3', text: 'The crane is looking way up high into the sky!' }
        }
      }
    ]
  },
  {
    id: 'cement_mixer',
    nameEn: 'Cement Mixer',
    themeColorHex: '#10B981',
    accentColorHex: '#EC4899',
    groundColorHex: '#E0E7FF',
    introVoice: {
      L1: { id: 'cm_intro_l1', text: 'Mixer! Spin, spin!' },
      L2: { id: 'cm_intro_l2', text: 'Here is the cement mixer! Let us spin and mix!' },
      L3: { id: 'cm_intro_l3', text: 'The colorful cement mixer is going to pave a star road!' }
    },
    chantVoice: {
      id: 'cm_chant',
      text: 'Pour it in, spin the drum! Round and round to make a road!'
    },
    steps: [
      {
        stepId: 'cm_step_1_pour',
        targetPartId: 'part_funnel',
        gestureType: 'DRAG_DIRECTION',
        allowTapFallback: true,
        dragDirectionScreen: [0, 1],
        autoSnapThreshold: 0.30,
        sfxOnStart: 'pop',
        sfxOnComplete: 'star_magic',
        voice: {
          L1: {
            promptId: 'cm_s1_p_l1', prompt: 'Pour! In, in!',
            actionWordId: 'cm_s1_a_l1', actionWord: 'Plop, splash!',
            completeId: 'cm_s1_c_l1', complete: 'All inside!'
          },
          L2: {
            promptId: 'cm_s1_p_l2', prompt: 'Pour in the rocks and water!',
            actionWordId: 'cm_s1_a_l2', actionWord: 'Pouring them in!',
            completeId: 'cm_s1_c_l2', complete: 'Good! Rocks and colors are inside!'
          },
          L3: {
            promptId: 'cm_s1_p_l3', prompt: 'Pull the funnel down to pour pebbles, water, and rainbow paint inside!',
            actionWordId: 'cm_s1_a_l3', actionWord: 'Pouring all the magic materials in!',
            completeId: 'cm_s1_c_l3', complete: 'Everything is inside the big striped drum!'
          }
        }
      },
      {
        stepId: 'cm_step_2_spin',
        targetPartId: 'part_mixer_drum',
        gestureType: 'DRAG_DIRECTION',
        allowTapFallback: true,
        dragDirectionScreen: [1, 0],
        autoSnapThreshold: 0.30,
        sfxOnStart: 'mix',
        sfxOnComplete: 'star_magic',
        voice: {
          L1: {
            promptId: 'cm_s2_p_l1', prompt: 'Drum! Spin, spin!',
            actionWordId: 'cm_s2_a_l1', actionWord: 'Mix, mix, mix!',
            completeId: 'cm_s2_c_l1', complete: 'All mixed!'
          },
          L2: {
            promptId: 'cm_s2_p_l2', prompt: 'Spin the big drum! Mix it up!',
            actionWordId: 'cm_s2_a_l2', actionWord: 'Spinning and mixing!',
            completeId: 'cm_s2_c_l2', complete: 'Round and round! The cement is ready!'
          },
          L3: {
            promptId: 'cm_s2_p_l3', prompt: 'Swipe the candy-striped drum across to spin and mix everything together!',
            actionWordId: 'cm_s2_a_l3', actionWord: 'The striped drum is spinning fast!',
            completeId: 'cm_s2_c_l3', complete: 'Look at the rainbow bubbles! It is mixed so well!'
          }
        }
      },
      {
        stepId: 'cm_step_3_pave',
        targetPartId: 'part_chute',
        gestureType: 'DRAG_DIRECTION',
        allowTapFallback: true,
        dragDirectionScreen: [0.9, 0.4],
        autoSnapThreshold: 0.30,
        sfxOnStart: 'splash',
        sfxOnComplete: 'star_magic',
        voice: {
          L1: {
            promptId: 'cm_s3_p_l1', prompt: 'Slide! Road!',
            actionWordId: 'cm_s3_a_l1', actionWord: 'Swoosh! Stars!',
            completeId: 'cm_s3_c_l1', complete: 'Star road! Yay!'
          },
          L2: {
            promptId: 'cm_s3_p_l2', prompt: 'Lower the chute! Pave the road!',
            actionWordId: 'cm_s3_a_l2', actionWord: 'Pouring the road!',
            completeId: 'cm_s3_c_l2', complete: 'Wow! A shiny rainbow star road!'
          },
          L3: {
            promptId: 'cm_s3_p_l3', prompt: 'Slide the purple chute down to pour out a sparkling star road!',
            actionWordId: 'cm_s3_a_l3', actionWord: 'Rainbow cement is sliding down!',
            completeId: 'cm_s3_c_l3', complete: 'Hooray! Five glowing star tiles are lighting up the road!'
          }
        }
      }
    ],
    freePlayParts: [
      {
        partId: 'fp_horn',
        partNameEn: 'Horn',
        sfxType: 'horn',
        resultVoice: {
          L1: { id: 'cm_fp_horn_l1', text: 'Beep, beep! Horn!' },
          L2: { id: 'cm_fp_horn_l2', text: 'Beep, beep! The mixer horn sounds so cute!' },
          L3: { id: 'cm_fp_horn_l3', text: 'Beep, beep! The cement mixer plays a happy tune!' }
        }
      },
      {
        partId: 'fp_wheels',
        partNameEn: 'Wheels',
        sfxType: 'wheel',
        resultVoice: {
          L1: { id: 'cm_fp_wheel_l1', text: 'Wheels! Spin, spin!' },
          L2: { id: 'cm_fp_wheel_l2', text: 'Spin, spin! The wheels are rolling round!' },
          L3: { id: 'cm_fp_wheel_l3', text: 'The wheels spin round just like the big mixer drum!' }
        }
      },
      {
        partId: 'fp_eyes',
        partNameEn: 'Eyes',
        sfxType: 'eye_giggle',
        resultVoice: {
          L1: { id: 'cm_fp_eye_l1', text: 'Hehe! Happy eyes!' },
          L2: { id: 'cm_fp_eye_l2', text: 'Giggle, giggle! Happy mixer eyes!' },
          L3: { id: 'cm_fp_eye_l3', text: 'Round and round, the mixer eyes are giggling with joy!' }
        }
      }
    ]
  },
  {
    id: 'bulldozer',
    nameEn: 'Bulldozer',
    themeColorHex: '#EAB308',
    accentColorHex: '#64748B',
    groundColorHex: '#FED7AA',
    introVoice: {
      L1: { id: 'bd_intro_l1', text: 'Bulldozer! Push, push!' },
      L2: { id: 'bd_intro_l2', text: 'Here comes the strong bulldozer! Let us clear the road!' },
      L3: { id: 'bd_intro_l3', text: 'Big blocks are on the road! The strong bulldozer can push them!' }
    },
    chantVoice: {
      id: 'bd_chant',
      text: 'Drop the blade, push ahead! Clear the rocks and make a way!'
    },
    steps: [
      {
        stepId: 'bd_step_1_smoke',
        targetPartId: 'part_exhaust_pipe',
        gestureType: 'DRAG_DIRECTION',
        allowTapFallback: true,
        dragDirectionScreen: [0, -1],
        autoSnapThreshold: 0.30,
        sfxOnStart: 'engine',
        sfxOnComplete: 'star_magic',
        voice: {
          L1: {
            promptId: 'bd_s1_p_l1', prompt: 'Pipe! Puff, puff!',
            actionWordId: 'bd_s1_a_l1', actionWord: 'Vroom! Puff!',
            completeId: 'bd_s1_c_l1', complete: 'Cloud rings!'
          },
          L2: {
            promptId: 'bd_s1_p_l2', prompt: 'Swipe the pipe up! Start the engine!',
            actionWordId: 'bd_s1_a_l2', actionWord: 'Starting the engine!',
            completeId: 'bd_s1_c_l2', complete: 'Vroom, vroom! Look at the white cloud rings!'
          },
          L3: {
            promptId: 'bd_s1_p_l3', prompt: 'Swipe the black chimney up to wake up the strong engine!',
            actionWordId: 'bd_s1_a_l3', actionWord: 'The strong engine is rumbling!',
            completeId: 'bd_s1_c_l3', complete: 'Puff, puff! Cute white cloud rings are floating into the sky!'
          }
        }
      },
      {
        stepId: 'bd_step_2_blade',
        targetPartId: 'part_dozer_blade',
        gestureType: 'DRAG_DIRECTION',
        allowTapFallback: true,
        dragDirectionScreen: [0, 1],
        autoSnapThreshold: 0.30,
        sfxOnStart: 'hydraulic',
        sfxOnComplete: 'star_magic',
        voice: {
          L1: {
            promptId: 'bd_s2_p_l1', prompt: 'Blade! Down!',
            actionWordId: 'bd_s2_a_l1', actionWord: 'Thud! Down!',
            completeId: 'bd_s2_c_l1', complete: 'Blade is down!'
          },
          L2: {
            promptId: 'bd_s2_p_l2', prompt: 'Drop the big blade down!',
            actionWordId: 'bd_s2_a_l2', actionWord: 'Dropping the blade!',
            completeId: 'bd_s2_c_l2', complete: 'Boom! The heavy blade is on the ground!'
          },
          L3: {
            promptId: 'bd_s2_p_l3', prompt: 'Slide the big silver blade down so it touches the ground!',
            actionWordId: 'bd_s2_a_l3', actionWord: 'Lowering the wide silver blade!',
            completeId: 'bd_s2_c_l3', complete: 'The wide blade is locked down and ready to push!'
          }
        }
      },
      {
        stepId: 'bd_step_3_push',
        targetPartId: 'part_dozer_blade',
        gestureType: 'DRAG_DIRECTION',
        allowTapFallback: true,
        dragDirectionScreen: [1, 0],
        autoSnapThreshold: 0.30,
        sfxOnStart: 'dig',
        sfxOnComplete: 'clear_cheer',
        voice: {
          L1: {
            promptId: 'bd_s3_p_l1', prompt: 'Rocks! Push, push!',
            actionWordId: 'bd_s3_a_l1', actionWord: 'Push! Boom!',
            completeId: 'bd_s3_c_l1', complete: 'Clean road! Yay!'
          },
          L2: {
            promptId: 'bd_s3_p_l2', prompt: 'Drive forward! Push the blocks away!',
            actionWordId: 'bd_s3_a_l2', actionWord: 'Pushing the rocks!',
            completeId: 'bd_s3_c_l2', complete: 'Yay! The bulldozer cleared the road!'
          },
          L3: {
            promptId: 'bd_s3_p_l3', prompt: 'Slide the bulldozer forward to push all the blocks into the gap!',
            actionWordId: 'bd_s3_a_l3', actionWord: 'Pushing forward with super power!',
            completeId: 'bd_s3_c_l3', complete: 'Awesome! The blocks filled the gap and made a flat bridge!'
          }
        }
      }
    ],
    freePlayParts: [
      {
        partId: 'fp_horn',
        partNameEn: 'Horn',
        sfxType: 'horn',
        resultVoice: {
          L1: { id: 'bd_fp_horn_l1', text: 'Honk, honk! Strong horn!' },
          L2: { id: 'bd_fp_horn_l2', text: 'Honk, honk! The bulldozer horn is super loud!' },
          L3: { id: 'bd_fp_horn_l3', text: 'Honk, honk! Super strong bulldozer coming through!' }
        }
      },
      {
        partId: 'fp_wheels',
        partNameEn: 'Tracks',
        sfxType: 'wheel',
        resultVoice: {
          L1: { id: 'bd_fp_wheel_l1', text: 'Tracks! Crunch, crunch!' },
          L2: { id: 'bd_fp_wheel_l2', text: 'Crunch, crunch! Heavy tracks are rolling!' },
          L3: { id: 'bd_fp_wheel_l3', text: 'Triangle tracks give the bulldozer super pushing power!' }
        }
      },
      {
        partId: 'fp_eyes',
        partNameEn: 'Eyes',
        sfxType: 'eye_giggle',
        resultVoice: {
          L1: { id: 'bd_fp_eye_l1', text: 'Brave eyes!' },
          L2: { id: 'bd_fp_eye_l2', text: 'Wink, wink! Strong and happy bulldozer!' },
          L3: { id: 'bd_fp_eye_l3', text: 'Nothing is too heavy for this brave little bulldozer!' }
        }
      }
    ]
  }
];

