# Sound credits

All recorded sound files in this folder are cut from **CC0 (public domain)** recordings; the rest
were synthesised for DON'T DIE (see "Skin voices" below). CC0 does not require attribution, so this
is a courtesy credit (the authors ask for it politely, and it keeps the source of each file on record
for the App Store).

| File | Used for | Source recording | Author | Licence |
|---|---|---|---|---|
| `quack-1.mp3` | normal duck bonk (+1), variant 1 | "Ducks" (BigSoundBank #0276), call at 1.33–1.69 s | Denis Chardonnet, via BigSoundBank / LaSonothèque (Joseph Sardin) | CC0 1.0 |
| `quack-2.mp3` | normal duck bonk (+1), variant 2 | same recording, call at 0.31–0.73 s | Denis Chardonnet | CC0 1.0 |
| `quack-3.mp3` | normal duck bonk (+1), variant 3 | same recording, call at 18.45–18.67 s | Denis Chardonnet | CC0 1.0 |
| `quack-red.mp3` | red runner duck (+5), escaping red/golden duck | same recording, three calls at 18.45–19.12 s | Denis Chardonnet | CC0 1.0 |
| `quack-golden.mp3` | golden duck, DUCK FRENZY start | same recording, call at 0.75–1.15 s | Denis Chardonnet | CC0 1.0 |
| `quack-blip.mp3` | DUCK FRENZY taps | same recording, attack of the call at 18.47 s | Denis Chardonnet | CC0 1.0 |
| `squeak.mp3` | rubber-duck squeak layered on some bonks | "Squeaker toy #2" (BigSoundBank #0879), squeeze at 0.07–0.26 s | Joseph Sardin, BigSoundBank | CC0 1.0 |

Sources:

- Ducks: <https://bigsoundbank.com/ducks-s0276.html> (WAV: <https://bigsoundbank.com/UPLOAD/bwf-en/0276.wav>)
- Squeaker toy #2: <https://bigsoundbank.com/sound-s0879.html> (WAV: <https://bigsoundbank.com/UPLOAD/bwf-en/0879.wav>)
- Licence terms: <https://bigsoundbank.com/licenses.html> (each page says "CC0 (public domain): Free and royalty-free",
  commercial use, editing and redistribution allowed, no attribution required).
- CC0 1.0: <https://creativecommons.org/publicdomain/zero/1.0/>

## Changes made

Made for DON'T DIE in October 2026 with ffmpeg 7.0.2 and a small Python script:

- Stereo to mono, resampled to 44.1 kHz; single calls cut out of the longer field recording.
- 140 Hz high-pass (removes wind/handling rumble; 300 Hz on the squeak) and light FFT noise reduction (`afftdn`, 10 dB).
- Silence trimmed (kept 8 ms before the first sound and 25 ms after the last), 5 ms fade-in, 5–80 ms fade-out.
- Loudness matched: the voiced part of each file is set to about -15 dBFS RMS (-17 for the squeak), peaks kept below -1 dBFS.
- `quack-red`: pitched up about 3.4 semitones and sped up 1.37x, so it sounds quick and excited.
- `quack-golden`: pitched down 5 semitones, with an extra copy an octave lower mixed in at -7 dB,
  a +4 dB bass boost and a short echo tail, so it sounds big and deep.
- `quack-blip`: first 115 ms of one call, pitched up 1.3 semitones, with a 30 ms fade-out.
- Encoded as 96 kbps mono MP3. The game also varies pitch and volume a little each time a sound plays.

Other sources were checked and left out. Most duck recordings on Wikimedia Commons and xeno-canto are
CC BY-SA, and the duck clip on OpenGameArt ("farm animals") is also BY-SA. BBC Sound Effects is licensed
for personal, educational and research use only, so it can't be used in a commercial app.

## Skin voices (`skins/`)

Every skin has two takes: `skins/<id>.mp3` (the short "hello" when a run starts with the skin, or it's
picked or revealed in the shop) and `skins/<id>-power.mp3` (when its super power fires). They are cut from
**CC0 (public domain)** recordings, or synthesised for DON'T DIE (marked *synth*; no recording involved).

| Files | Skin | Source recording(s) | Author(s) | Licence | What it is (hello / power) |
|---|---|---|---|---|---|
| `classic.mp3`, `classic-power.mp3` | CLASSIC | *synth* (made in Python/NumPy for the game) | DON'T DIE | original work | glass ping (synth) / ping that slows down like a tape stop |
| `mint.mp3`, `mint-power.mp3` | MINT CHIP | "Ice cubes in a glass #1" (BigSoundBank #2123) | Joseph SARDIN | CC0 1.0 | ice cubes clinking in a glass / two clinks and a falling icy shimmer |
| `bubblegum.mp3`, `bubblegum-power.mp3` | BUBBLEGUM | "Balloon, inflation #2" (BigSoundBank #1130); "Bubbles Burst" (BigSoundBank #1074) | Joseph SARDIN | CC0 1.0 | a quick blow and a gum POP (mouth) / a balloon blown up, then pop-pop |
| `lemon.mp3`, `lemon-power.mp3` | LEMON | "Lemon Squeeze" (freesound #845258) | nazwhale | CC0 1.0 | a lemon squeezed / longer squeeze and a rising 'bwip' as you shrink |
| `grape.mp3`, `grape-power.mp3` | GRAPE | "Bubbles Burst" (BigSoundBank #1074); "Squelching SFX [6]" (freesound #649982); "Whoosh #4" (BigSoundBank #1796) | Joseph SARDIN; SoundDesignForYou | CC0 1.0 | a juicy grape squish / two vine whips (rope whooshes) and a squish |
| `tangerine.mp3`, `tangerine-power.mp3` | TANGERINE | "Orange Peel Ripping" (freesound #582105); "Whoosh #8" (BigSoundBank #1801) | AKkingStudio; Joseph SARDIN | CC0 1.0 | orange peel ripping / peel rip into a fast metal-tube whoosh |
| `frosty.mp3`, `frosty-power.mp3` | FROSTY | "Cracking ice #1" (BigSoundBank #2205); "Cracking ice #2" (BigSoundBank #2206) | Joseph SARDIN | CC0 1.0 | ice cracking / longer crackle, icy chimes and a cold wind |
| `blush.mp3`, `blush-power.mp3` | BLUSH | "Kiss #1" (BigSoundBank #2196); "Kisses #3" (BigSoundBank #2199) | Joseph SARDIN | CC0 1.0 | a kiss and a soft two-note chime / double kiss and a heart arpeggio |
| `moon.mp3`, `moon-power.mp3` | MOON | *synth* (made in Python/NumPy for the game) | DON'T DIE | original work | soft ethereal 'ooo' with a twinkle (synth) / a sweeping orbit swoosh, pitch up and over |
| `potato.mp3`, `potato-power.mp3` | POTATO | "Potatoes-On-Plate.aif" (freesound #288927); "Yawn #1" (BigSoundBank #1406) | toefur; Joseph SARDIN | CC0 1.0 | a potato thunks onto a plate / thunk, then a big lazy yawn |
| `melon.mp3`, `melon-power.mp3` | WATERMELON | "watermelon.ogg" (freesound #646778); "Watermelon_Squelch4.wav" (freesound #159669); "Splash, Small #1" (BigSoundBank #1529) | pbimal; lolamadeus; Joseph SARDIN | CC0 1.0 | knock-knock on a watermelon / a juicy watermelon squelch and splash |
| `cookie.mp3`, `cookie-power.mp3` | COOKIE | "Eat a Rusk" (BigSoundBank #0407) | Joseph SARDIN | CC0 1.0 | a crunchy biscuit bite / three crunchy bites in a row |
| `cherry.mp3`, `cherry-power.mp3` | CHERRY | "Coins #2" (BigSoundBank #0194); "Counter Bell #3" (BigSoundBank #2531) | Joseph SARDIN | CC0 1.0 | a hotel counter bell 'ding' / ding-ding-DING and a cascade of coins |
| `marble.mp3`, `marble-power.mp3` | MARBLE | "Glass ball, bounce #1" (BigSoundBank #2240) | Joseph SARDIN | CC0 1.0 | glass marble clink-clink / clink, then a marble bouncing faster and faster |
| `tennis.mp3`, `tennis-power.mp3` | TENNIS | "Tennis Ball: Bounce" (BigSoundBank #0584); "Tennis-Ball-Hit" (freesound #710041); "Tennis smash" (freesound #412863) | Joseph SARDIN; kletton97; gprosser | CC0 1.0 | tennis racket hit / a hard smash, then the ball bouncing |
| `eightball.mp3`, `eightball-power.mp3` | 8-BALL | "BILLIARD pool shots- CsG.wav" (freesound #350918); "billiard ball clack" (freesound #539854) | csaszi; Za-Games | CC0 1.0 | billiard balls clacking / the break shot scattering the rack |
| `egg.mp3`, `egg-power.mp3` | EGGY | "14 month old baby snoring" (BigSoundBank #0929); "Chick 1 (Stuffings)" (BigSoundBank #0430); "egg crack6.wav" (freesound #244741) | Joseph SARDIN; Reitanna | CC0 1.0 | a little baby snore / an egg cracking, then two chick peeps |
| `pumpkin.mp3`, `pumpkin-power.mp3` | PUMPKIN | "Strident Laughter" (BigSoundBank #0489) | Joseph SARDIN | CC0 1.0 | a short witchy 'heh-heh-heh' / a full witch cackle with a hall echo |
| `kitty.mp3`, `kitty-power.mp3` | KITTY | "Meow Cat #2" (BigSoundBank #1890); "Little meow of a cat #2" (BigSoundBank #1472) | Joseph SARDIN | CC0 1.0 | a small 'mew' / a big, long 'mrraaow' |
| `froggy.mp3`, `froggy-power.mp3` | FROGGY | "frog croak.wav" (freesound #377109) | benjibeastr | CC0 1.0 | a frog's ribbit croak / kvæk-kvæk, then a tongue 'thwip' |
| `panda.mp3`, `panda-power.mp3` | PANDA | "Apple crunched #1" (BigSoundBank #1113); "Raw carrot crunched #1" (BigSoundBank #1594); "Bones cracking #3" (BigSoundBank #1409) | Joseph SARDIN | CC0 1.0 | a crisp bamboo snap (celery) / snap, crunch and munching 'nom nom' |
| `beachball.mp3`, `beachball-power.mp3` | BEACH BALL | "Ball Rebounds" (BigSoundBank #1045); "Balloon against wall #1" (BigSoundBank #1825); "Boing cartoon #1" (BigSoundBank #2277); "Boing Cartoon #2" (BigSoundBank #2278) | Joseph SARDIN | CC0 1.0 | a beach-ball bonk with a little boing / bonk, a harp 'boing' and bounces |
| `donut.mp3`, `donut-power.mp3` | DONUT | "Slide Whistle.wav" (freesound #672965); "SLIDE WHISTLE - 1" (freesound #517633) | WalliumVA; SamuelGremaud | CC0 1.0 | a cartoon slide whistle 'fwee-oo-wee' / a long slide whistle rushing up |
| `soccer.mp3`, `soccer-power.mp3` | SOCCER | "Ball Kicked" (BigSoundBank #1044); "Plastic Whistle #1" (BigSoundBank #1017) | Joseph SARDIN | CC0 1.0 | a ball being kicked / the referee's whistle, then a kick |
| `eyeball.mp3`, `eyeball-power.mp3` | EYEBALL | "Squelching SFX [6]" (freesound #649982) | SoundDesignForYou | CC0 1.0 | a wet squelchy blink / squelch and an eerie rising 'third eye' swell |
| `bee.mp3`, `bee-power.mp3` | BUSY BEE | "Bumblebee #1" (BigSoundBank #1000) | Joseph SARDIN | CC0 1.0 | a bumblebee buzzing by / a swarm of buzzing bees |
| `disco.mp3`, `disco-power.mp3` | DISCO BALL | *synth* (made in Python/NumPy for the game) | DON'T DIE | original work | a funky 'bwap-bwap' chord stab (synth) / a bar of disco: kick, bass, stabs, mirror-ball sparkle |
| `ghost.mp3`, `ghost-power.mp3` | BOO | "Ghost #1" (BigSoundBank #2046); "Ghost #3" (BigSoundBank #2048) | Joseph SARDIN | CC0 1.0 | a ghostly 'hooo' (a voice) / a long ghost wail with a hall echo |
| `owl.mp3`, `owl-power.mp3` | NIGHT OWL | "Tawny Owl #3" (BigSoundBank #3459); "Tawny Owl #4" (BigSoundBank #3460) | Le tiroir du fond | CC0 1.0 | a tawny owl's 'hoo' / 'hoo... hoo-hoooo' (the full call) |
| `penguin.mp3`, `penguin-power.mp3` | PENGUIN | "Cartoon, Penguin 01.wav" (freesound #459156); "Penguin Sounds (penguin_01)" (OpenGameArt #132777); "Penguin Squeak" (freesound #705839) | LilMati; AntumDeluge (cut from Bidone, freesound #66150); Breviceps | CC0 1.0 | a cartoon penguin squawk / a real penguin call, two squeaks and a squawk |
| `robot.mp3`, `robot-power.mp3` | ROBO | *synth* (made in Python/NumPy for the game) | DON'T DIE | original work | robot beeps 'bee-boo-bip' (synth) / servo whirr, computing beeps, power-up chord |
| `hamster.mp3`, `hamster-power.mp3` | HAMSTER | "Bicycle Rear Wheel" (BigSoundBank #0140); "hamster Squeak， animal sound ，" (freesound #815243) | Joseph SARDIN; lusania | CC0 1.0 | a hamster's 'eek-eek' / squeaks over a spinning, ticking wheel |
| `bunny.mp3`, `bunny-power.mp3` | BUNNY | "Boing cartoon #7" (BigSoundBank #2283); "Raw carrot crunched #1" (BigSoundBank #1594) | Joseph SARDIN | CC0 1.0 | a tiny hop and a carrot crunch / three springy hops (harp boings) and a crunch |
| `octopus.mp3`, `octopus-power.mp3` | OCTO | "Water bubbles" (BigSoundBank #0150); "Squelching SFX [6]" (freesound #649982) | Joseph SARDIN; SoundDesignForYou | CC0 1.0 | underwater 'blub-blub' bubbles / an inky squelch and a burst of bubbles |
| `lava.mp3`, `lava-power.mp3` | LAVA | "Frying pan #2" (BigSoundBank #0144); "Gasoline Fire #2" (BigSoundBank #1341); "Bubbles Burst" (BigSoundBank #1074) | Joseph SARDIN | CC0 1.0 | a deep lava 'blorp' and a hiss of sizzle / a gasoline fire igniting over rumble and sizzle |
| `galaxy.mp3`, `galaxy-power.mp3` | GALAXY | *synth* (made in Python/NumPy for the game) | DON'T DIE | original work | a cosmic arpeggio shimmer (synth) / a rising hyperdrive whine into a boom and stars |
| `cyber.mp3`, `cyber-power.mp3` | CYBER EYE | *synth* (made in Python/NumPy for the game) | DON'T DIE | original work | targeting beeps 'bip..bip.bip-BEEP' (synth) / scan sweep, lock-on tone and a laser 'pew' |
| `pizza.mp3`, `pizza-power.mp3` | PIZZA PAL | "Champagne cork #2" (BigSoundBank #0648); "Party horn #1" (BigSoundBank #1553); "Party horn #3" (BigSoundBank #1555) | Joseph SARDIN | CC0 1.0 | a party-horn toot / a champagne cork pop and a long party horn |
| `plasma.mp3`, `plasma-power.mp3` | PLASMA | "Electric shock" (BigSoundBank #0134); "Short welds" (BigSoundBank #0952) | Joseph SARDIN | CC0 1.0 | an electric zap with a little arc / a crackling welding arc and big zaps |
| `fishbowl.mp3`, `fishbowl-power.mp3` | FISHBOWL | "Water bubbles" (BigSoundBank #0150); "Splash, Big #3" (BigSoundBank #1521); "Splash, Small #1" (BigSoundBank #1529) | Joseph SARDIN | CC0 1.0 | a stone plopping into water / a big splash, then bubbles |
| `ufo.mp3`, `ufo-power.mp3` | UFO | *synth* (made in Python/NumPy for the game) | DON'T DIE | original work | a theremin 'wooOOoo' warble (synth) / a pulsing tractor beam rising, then a 'bloop' |
| `ninja.mp3`, `ninja-power.mp3` | NINJA | "Sword" (BigSoundBank #0129); "Sword Through the Air" (BigSoundBank #0128); "Whoosh #4" (BigSoundBank #1796) | Joseph SARDIN | CC0 1.0 | a sword blade 'shing' / two fast slashes and a final shing |
| `dragon.mp3`, `dragon-power.mp3` | DRAGON | "Dragon Roar" (freesound #442964); "Basic Fire Whoosh 2" (freesound #260555) | qubodup; LookIMadeAThing | CC0 1.0 | a small growly baby-dragon roar / a bigger roar and a breath of fire |
| `storm.mp3`, `storm-power.mp3` | STORM CLOUD | "Thunder #2" (BigSoundBank #3113) | Joseph SARDIN & Axeline T. | CC0 1.0 | a crack of thunder / a big thunder crack rolling into a rumble |
| `crown.mp3`, `crown-power.mp3` | GOLDEN CROWN | "Bugle Awake for Morning Call" (BigSoundBank #3263) | Joseph SARDIN | CC0 1.0 | a royal bugle 'ta-ta-taa' / the full bugle fanfare with a timpani boom and sparkles |
| `duckking.mp3`, `duckking-power.mp3` | DUCK KING | "Ducks" (BigSoundBank #0276) | DenisChardonnet | CC0 1.0 | a deep royal QUACK with a brass 'ta-daa' / a whole army of quacks, a brass fanfare and the king's QUACK |
| `phoenix.mp3`, `phoenix-power.mp3` | PHOENIX | "Basic Fire Whoosh 2" (freesound #260555); "Gasoline Fire #2" (BigSoundBank #1341); "hawk.wav" (freesound #582183) | LookIMadeAThing; Joseph SARDIN; denalwa | CC0 1.0 | a hawk's screech over a burst of flame / fire whoosh, two fiery screeches |
| `unicorn.mp3`, `unicorn-power.mp3` | UNICORN | "Magic Wand Glitter" (freesound #211624); "Neighing of a Horse #1" (BigSoundBank #0284); "Little neighing call #1" (BigSoundBank #1212) | qubodup; DenisChardonnet; Joseph SARDIN | CC0 1.0 | a little pony neigh with magic glitter / a harp sweep, a full neigh and glitter |
| `supernova.mp3`, `supernova-power.mp3` | SUPERNOVA | "Explosion #2" (BigSoundBank #1808) | Joseph SARDIN | CC0 1.0 | a quick rising shimmer (synth) / a big riser into an explosion boom and a bright chord |
| `blackhole.mp3`, `blackhole-power.mp3` | BLACK HOLE | *synth* (made in Python/NumPy for the game) | DON'T DIE | original work | a deep 'vwoooom' whoosh (synth) / everything sucked in, rising, then a GULP |

Source pages (each one states the CC0 licence; checked when downloaded in October 2026):

- "Ice cubes in a glass #1" (BigSoundBank #2123) by Joseph SARDIN: <https://bigsoundbank.com/ice-cubes-in-a-glass-1-s2123.html>
- "Balloon, inflation #2" (BigSoundBank #1130) by Joseph SARDIN: <https://bigsoundbank.com/balloon-inflation-2-s1130.html>
- "Bubbles Burst" (BigSoundBank #1074) by Joseph SARDIN: <https://bigsoundbank.com/bubbles-burst-s1074.html>
- "Lemon Squeeze" (freesound #845258) by nazwhale: <https://freesound.org/people/nazwhale/sounds/845258/> (HQ preview MP3 used)
- "Squelching SFX [6]" (freesound #649982) by SoundDesignForYou: <https://freesound.org/people/SoundDesignForYou/sounds/649982/> (HQ preview MP3 used)
- "Whoosh #4" (BigSoundBank #1796) by Joseph SARDIN: <https://bigsoundbank.com/whoosh-4-s1796.html>
- "Orange Peel Ripping" (freesound #582105) by AKkingStudio: <https://freesound.org/people/AKkingStudio/sounds/582105/> (HQ preview MP3 used)
- "Whoosh #8" (BigSoundBank #1801) by Joseph SARDIN: <https://bigsoundbank.com/whoosh-8-s1801.html>
- "Cracking ice #1" (BigSoundBank #2205) by Joseph SARDIN: <https://bigsoundbank.com/cracking-ice-1-s2205.html>
- "Cracking ice #2" (BigSoundBank #2206) by Joseph SARDIN: <https://bigsoundbank.com/cracking-ice-2-s2206.html>
- "Kiss #1" (BigSoundBank #2196) by Joseph SARDIN: <https://bigsoundbank.com/kiss-1-s2196.html>
- "Kisses #3" (BigSoundBank #2199) by Joseph SARDIN: <https://bigsoundbank.com/kisses-3-s2199.html>
- "Potatoes-On-Plate.aif" (freesound #288927) by toefur: <https://freesound.org/people/toefur/sounds/288927/> (HQ preview MP3 used)
- "Yawn #1" (BigSoundBank #1406) by Joseph SARDIN: <https://bigsoundbank.com/yawn-1-s1406.html>
- "watermelon.ogg" (freesound #646778) by pbimal: <https://freesound.org/people/pbimal/sounds/646778/> (HQ preview MP3 used)
- "Watermelon_Squelch4.wav" (freesound #159669) by lolamadeus: <https://freesound.org/people/lolamadeus/sounds/159669/> (HQ preview MP3 used)
- "Splash, Small #1" (BigSoundBank #1529) by Joseph SARDIN: <https://bigsoundbank.com/splash-small-1-s1529.html>
- "Eat a Rusk" (BigSoundBank #0407) by Joseph SARDIN: <https://bigsoundbank.com/eat-a-rusk-s0407.html>
- "Coins #2" (BigSoundBank #0194) by Joseph SARDIN: <https://bigsoundbank.com/coins-2-s0194.html>
- "Counter Bell #3" (BigSoundBank #2531) by Joseph SARDIN: <https://bigsoundbank.com/counter-bell-3-s2531.html>
- "Glass ball, bounce #1" (BigSoundBank #2240) by Joseph SARDIN: <https://bigsoundbank.com/glass-ball-bounce-1-s2240.html>
- "Tennis Ball: Bounce" (BigSoundBank #0584) by Joseph SARDIN: <https://bigsoundbank.com/tennis-ball-bounce-s0584.html>
- "Tennis-Ball-Hit" (freesound #710041) by kletton97: <https://freesound.org/people/kletton97/sounds/710041/> (HQ preview MP3 used)
- "Tennis smash" (freesound #412863) by gprosser: <https://freesound.org/people/gprosser/sounds/412863/> (HQ preview MP3 used)
- "BILLIARD pool shots- CsG.wav" (freesound #350918) by csaszi: <https://freesound.org/people/csaszi/sounds/350918/> (HQ preview MP3 used)
- "billiard ball clack" (freesound #539854) by Za-Games: <https://freesound.org/people/Za-Games/sounds/539854/> (HQ preview MP3 used)
- "14 month old baby snoring" (BigSoundBank #0929) by Joseph SARDIN: <https://bigsoundbank.com/14-month-old-baby-snoring-s0929.html>
- "Chick 1 (Stuffings)" (BigSoundBank #0430) by Joseph SARDIN: <https://bigsoundbank.com/chick-1-stuffings-s0430.html>
- "egg crack6.wav" (freesound #244741) by Reitanna: <https://freesound.org/people/Reitanna/sounds/244741/> (HQ preview MP3 used)
- "Strident Laughter" (BigSoundBank #0489) by Joseph SARDIN: <https://bigsoundbank.com/strident-laughter-s0489.html>
- "Meow Cat #2" (BigSoundBank #1890) by Joseph SARDIN: <https://bigsoundbank.com/meow-cat-2-s1890.html>
- "Little meow of a cat #2" (BigSoundBank #1472) by Joseph SARDIN: <https://bigsoundbank.com/little-meow-of-a-cat-2-s1472.html>
- "frog croak.wav" (freesound #377109) by benjibeastr: <https://freesound.org/people/benjibeastr/sounds/377109/> (HQ preview MP3 used)
- "Apple crunched #1" (BigSoundBank #1113) by Joseph SARDIN: <https://bigsoundbank.com/apple-crunched-1-s1113.html>
- "Raw carrot crunched #1" (BigSoundBank #1594) by Joseph SARDIN: <https://bigsoundbank.com/raw-carrot-crunched-1-s1594.html>
- "Bones cracking #3" (BigSoundBank #1409) by Joseph SARDIN: <https://bigsoundbank.com/bones-cracking-3-s1409.html>
- "Ball Rebounds" (BigSoundBank #1045) by Joseph SARDIN: <https://bigsoundbank.com/ball-rebounds-s1045.html>
- "Balloon against wall #1" (BigSoundBank #1825) by Joseph SARDIN: <https://bigsoundbank.com/balloon-against-wall-1-s1825.html>
- "Boing cartoon #1" (BigSoundBank #2277) by Joseph SARDIN: <https://bigsoundbank.com/boing-cartoon-1-s2277.html>
- "Boing Cartoon #2" (BigSoundBank #2278) by Joseph SARDIN: <https://bigsoundbank.com/boing-cartoon-2-s2278.html>
- "Slide Whistle.wav" (freesound #672965) by WalliumVA: <https://freesound.org/people/WalliumVA/sounds/672965/> (HQ preview MP3 used)
- "SLIDE WHISTLE - 1" (freesound #517633) by SamuelGremaud: <https://freesound.org/people/SamuelGremaud/sounds/517633/> (HQ preview MP3 used)
- "Ball Kicked" (BigSoundBank #1044) by Joseph SARDIN: <https://bigsoundbank.com/ball-kicked-s1044.html>
- "Plastic Whistle #1" (BigSoundBank #1017) by Joseph SARDIN: <https://bigsoundbank.com/plastic-whistle-s1017.html>
- "Bumblebee #1" (BigSoundBank #1000) by Joseph SARDIN: <https://bigsoundbank.com/bumblebee-1-s1000.html>
- "Ghost #1" (BigSoundBank #2046) by Joseph SARDIN: <https://bigsoundbank.com/ghost-1-s2046.html>
- "Ghost #3" (BigSoundBank #2048) by Joseph SARDIN: <https://bigsoundbank.com/ghost-3-s2048.html>
- "Tawny Owl #3" (BigSoundBank #3459) by Le tiroir du fond: <https://bigsoundbank.com/tawny-owl-3-s3459.html>
- "Tawny Owl #4" (BigSoundBank #3460) by Le tiroir du fond: <https://bigsoundbank.com/tawny-owl-4-s3460.html>
- "Cartoon, Penguin 01.wav" (freesound #459156) by LilMati: <https://freesound.org/people/LilMati/sounds/459156/> (HQ preview MP3 used)
- "Penguin Sounds (penguin_01)" (OpenGameArt #132777) by AntumDeluge (cut from Bidone, freesound #66150): <https://opengameart.org/content/penguin-sounds> (FLAC from the zip; itself cut from freesound #66150 by Bidone, CC0: <https://freesound.org/s/66150/>)
- "Penguin Squeak" (freesound #705839) by Breviceps: <https://freesound.org/people/Breviceps/sounds/705839/> (HQ preview MP3 used)
- "Bicycle Rear Wheel" (BigSoundBank #0140) by Joseph SARDIN: <https://bigsoundbank.com/bicycle-rear-wheel-s0140.html>
- "hamster Squeak， animal sound ，" (freesound #815243) by lusania: <https://freesound.org/people/lusania/sounds/815243/> (HQ preview MP3 used)
- "Boing cartoon #7" (BigSoundBank #2283) by Joseph SARDIN: <https://bigsoundbank.com/boing-cartoon-7-s2283.html>
- "Water bubbles" (BigSoundBank #0150) by Joseph SARDIN: <https://bigsoundbank.com/water-bubbles-s0150.html>
- "Frying pan #2" (BigSoundBank #0144) by Joseph SARDIN: <https://bigsoundbank.com/frying-pan-2-s0144.html>
- "Gasoline Fire #2" (BigSoundBank #1341) by Joseph SARDIN: <https://bigsoundbank.com/gasoline-fire-2-s1341.html>
- "Champagne cork #2" (BigSoundBank #0648) by Joseph SARDIN: <https://bigsoundbank.com/champagne-cork-2-s0648.html>
- "Party horn #1" (BigSoundBank #1553) by Joseph SARDIN: <https://bigsoundbank.com/party-horn-1-s1553.html>
- "Party horn #3" (BigSoundBank #1555) by Joseph SARDIN: <https://bigsoundbank.com/party-horn-3-s1555.html>
- "Electric shock" (BigSoundBank #0134) by Joseph SARDIN: <https://bigsoundbank.com/electric-shock-s0134.html>
- "Short welds" (BigSoundBank #0952) by Joseph SARDIN: <https://bigsoundbank.com/short-welds-s0952.html>
- "Splash, Big #3" (BigSoundBank #1521) by Joseph SARDIN: <https://bigsoundbank.com/splash-big-3-s1521.html>
- "Sword" (BigSoundBank #0129) by Joseph SARDIN: <https://bigsoundbank.com/sword-s0129.html>
- "Sword Through the Air" (BigSoundBank #0128) by Joseph SARDIN: <https://bigsoundbank.com/sword-through-the-air-s0128.html>
- "Dragon Roar" (freesound #442964) by qubodup: <https://freesound.org/people/qubodup/sounds/442964/> (HQ preview MP3 used)
- "Basic Fire Whoosh 2" (freesound #260555) by LookIMadeAThing: <https://freesound.org/people/LookIMadeAThing/sounds/260555/> (HQ preview MP3 used)
- "Thunder #2" (BigSoundBank #3113) by Joseph SARDIN & Axeline T.: <https://bigsoundbank.com/thunder-2-s3113.html>
- "Bugle Awake for Morning Call" (BigSoundBank #3263) by Joseph SARDIN: <https://bigsoundbank.com/bugle-awake-morning-call-s3263.html>
- "Ducks" (BigSoundBank #0276) by DenisChardonnet: <https://bigsoundbank.com/ducks-s0276.html>
- "hawk.wav" (freesound #582183) by denalwa: <https://freesound.org/people/denalwa/sounds/582183/> (HQ preview MP3 used)
- "Magic Wand Glitter" (freesound #211624) by qubodup: <https://freesound.org/people/qubodup/sounds/211624/> (HQ preview MP3 used)
- "Neighing of a Horse #1" (BigSoundBank #0284) by DenisChardonnet: <https://bigsoundbank.com/neighing-of-a-horse-1-s0284.html>
- "Little neighing call #1" (BigSoundBank #1212) by Joseph SARDIN: <https://bigsoundbank.com/little-neighing-call-1-s1212.html>
- "Explosion #2" (BigSoundBank #1808) by Joseph SARDIN: <https://bigsoundbank.com/explosion-2-s1808.html>

Licence terms: BigSoundBank <https://bigsoundbank.com/licenses.html>; CC0 1.0 <https://creativecommons.org/publicdomain/zero/1.0/>
(freesound and OpenGameArt list CC0 on each sound's page). No attribution is required; this is a courtesy record.

### Changes made (skin voices)

Made for DON'T DIE in October 2026 with ffmpeg 7.0.2 and Python (NumPy/SciPy):

- Mono, 44.1 kHz. Single calls/hits cut out of the longer recordings; noisy ones (baby snore, bumblebee, hawk, ducks) cleaned
  with a high-pass and FFT noise reduction (`afftdn`).
- Pitch and speed changes (varispeed), layering of several cuts, short synthesised layers (bell chimes, a glassy ring on the
  marble clicks, thumps, sparkles, risers), a small synthetic reverb on some takes. The *synth* skins are fully synthesised.
- Silence trimmed, 3 ms fade-in and 20-40 ms fade-out (longer musical fades where noted), so there are no clicks.
- Loudness matched to the duck quacks: the loudest 200 ms (K-weighted) is set to about -13.5 LUFS for a hello and -12 for a
  power take; very peaky sounds went through a look-ahead limiter (up to about 13 dB) and may sit a few dB lower. Peaks stay
  under -1 dBFS after decoding.
- Hello takes are at most 0.8 s, power takes at most 1.85 s. Encoded as 64 kbps mono MP3.
