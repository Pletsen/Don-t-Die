# Fase 0 – grafik- og arkitektur-audit (graphics-artist + architecture reviewer)

Branch `claude/sharp-cray-vl9g49`, 2026-10-27. Playwright + SwiftShader 960x540, spillets egen løkke stoppet og `g.step()` kørt i hånden.
41 skærmbilleder i denne mappe, `render-info-*.json` (draw calls/trekanter pr. billede), `console-*.log` (0 fejl, 0 advarsler).
Rigtige FPS kan ikke måles i software-rendering.

| Billede | Calls | Trekanter |
|---|---|---|
| L1 | 252 | 728k |
| L8 | 259 | 900k |
| L12 høj / mellem / lav | 253 / 238 / 216 | 928k / 776k / 671k |
| L18 | 222 | 869k |
| L24 | 211 | 799k |
| L10 / L20 / L30 (boss) | 254 / 215 / 205 | 872k / 786k / 834k |

## 1. Fejl
1.1 Start-toast og første hjælpeboks overlapper på hver bane (Hud.ts toast 30 % højde, tip øverst til venstre). Fix: egen bane til toast, eller vent med tippet. (S)
1.2 `setTimeout(() => this.tip('draw'), 3800)` kan dukke op over pause/hulen. Fix: brug `this.delayed`. (S)
1.3 Kvalitetsindstillingen flytter buske/blomster (fælles RNG-strøm efter `q.vegetation`-ganget antal græs/bregner). Fix: én `Rng(seed+K)` pr. lag. (S)
1.4 Dødskameraet bliver mælkehvidt (`70-dying.png`), sandsynligvis kamera op i kroner/tåge/dither. Fix: skjul HUD i `die()`, begræns højden/raycast mod kroner. (S-M)
1.5 Kort skæres af ved 540 px højde (menu, hub, indstillinger). Fix: `max-height` + `overflow:auto`, "Styring" i `<details>`. (S)

## 2. Performance
2.1 `animalCtx()` laver nyt objekt + 6 closures pr. frame (to gange når død). Byg én gang pr. bane. (S)
2.2 `warmup()` kører kun én gang pr. session, men `disposeScene()` frigiver materialer ved hvert baneskift → hak ved første drab kan være tilbage fra bane 2. Mål `renderer.info.programs`, warm op hver bane eller hold materialer modul-delte. (S)
2.3 Vegetation og skygger dominerer trekanterne; intet kvalitetsniveau skærer skyggekastere.
2.4 Ét JS-bundt på 838 kB; efterbehandling kan lazy-loades.

## 3. Lyd og events (POLISH.md: `emit('playerHit') → AudioManager`)
Game.ts har 42 direkte `audio.*`-kald og ~20 kick/hitStop/burst/blood-kald; AudioDirector poller alle dyrs state/hp hver frame og holder fjernede dyr i sin Map.
3.1 Typet event-bus (`src/game/events.ts`) + `Feedback`-modul (kick, hitStop, slowmo, HUD-blink); AudioDirector abonnerer og ejer alle `play()`; `Animal.setState()` udsender `animalState` i stedet for poll. (M)
3.2 Fem hændelser i manifestet spilles aldrig: `step_snow`, `step_wood`, `arrow_whoosh`, `throw_spin`, `ui_hover`. (S)

## 4. Grafik
4.1 Hit/drab-feedback: vildsvinet blinker fladt laksrødt (ligner markering); kort hvid emissive pop + `Blood.spurt` + gnist-sprite. Lig, blodpøl og bytte forsvinder i græsset: flad græs omkring nye drab (`uClear`-uniform), `polygonOffset` på pøl, lysstribe/rim på bytte. Spiller ramt: kromatisk forskydning i grade. (S-M)
4.2 Nat (bane 18-30): uden for lanternens ~8 m er ulve usynlige. Stærkere måne-fill, rim-lys på alle arter skaleret med nat, øjenglimt til 35 m, tåge lidt lysere end silhuetter. (S-M)
4.3 Dyr viser deres opbygning (kugler/kapsler; elgens snude, alfaulv "insekt-agtig", kæmpe-elg på stylter, bjørn af bobler). Kort sigt: én samlet mesh med glatte normaler, pels-skal, større manker/pukler på bosser. Lang sigt: CC0-animerede dyr (afsnit 6). (L)
4.4 Vegetation: fyr = facetterede kegler, løvkroner = ler-klumper, 8 % brune kroner ligner døde klumper. Bladkort-klynger, falsk translucens, AO mod kronens midte. (M)
4.5 Skovbund: flad albedo; PBR-skovbund med world-UV, sti-blanding, løvinstanser. (M)
4.6 Dybde: stammer næsten sorte om dagen; vertex-AO ved stammefod, GTAO/N8AO på Høj/Ultra, højdetåge, god rays i skumring. (S-M)
4.7 Himmel: flad gråhvid om dagen, solskiven bliver en strakt ellipse ved kanten. Zenit-gradient + skystøj, rund skive i view space, begræns HDR. (S)
4.8 Jæger: fylder 1/3 af skærmen i hofte-view; bue/pil skjules bag kroppen under spænding → kamera mere til højre/op mens man spænder; buestrengen går gennem hovedet. (S)
4.9 Kvalitetsniveauer i dag: lav/mellem har ingen anti-aliasing; mellem og høj adskiller sig næsten kun ved MSAA, vegetation og sigt; skyggetype, skyggekastere, dyreskygge-afstand, græs-afstand, anisotropi og miljølys skaleres ikke; `shadow.radius` ignoreres af PCFSoft.
4.10 Ultra/Auto: SMAA på alle, VSM-skygger på Ultra, GTAO, god rays, højdetåge; Auto som "governor" med median-frametid og hysterese, dynamisk opløsning (0,6-1,0) uden genopbygning, valg huskes. (M)
4.11 Menuer: menu-baggrunden rammer en stor fyr; hulen dækkes af et fuldt kort (brug sidepanel); våben-miniaturer; guld-farvede slidere (`accent-color`); død/afslutning med blur og afmætning; toast uden baggrund; hule-klipper er ler-klumper.

## 5. Oprydning
5.1 18 af 22 `as unknown as` kan fjernes (tsc 0 fejl testet på kopi); tre beskytter døde fallback-grene (muzzle, swing.length, deathCam).
5.2 Død kode: `quality.ts`/`isLite`, `lerpAngle`, `World.grade.saturation`; ASSETS.md er forældet (peger på slettet `Sound.ts`).
5.3 Dubletter: `clamp`×4, `lerp`×2, `smooth`×6, `Spring`×2, `stripTo`×2, `Sky.mergeSimple`; to forskellige `HOSTILE`-mængder; `Bursts` og `Blood.dust` overlapper.
5.4 Spil-løkke: `step()` er 90 linjers if/else; overgange spredt (pauseScreenAgain-hack, DOM bruges som state for dødsskærmen). `setState()` med enter/exit; del Game.ts (1282 linjer) i Post, Shop, WeaponController, Feedback.

## 6. CC0-forslag (se polish/ASSETS_WANTED.md)
Quaternius "Ultimate Animated Animals", "Stylized Nature MegaKit"/"Ultimate Nature Pack", "Ultimate Modular Men", "Medieval Weapons Pack";
Poly Haven (fern_02, tree_stump_01, dead_tree_trunk, rock_moss_set_01/02; teksturer forrest_ground_01, forest_leaves_02, brown_mud_leaves_01, bark_brown_02, rock_boulder_dry; HDRI kloofendal_48d_partly_cloudy, the_sky_is_on_fire, moonless_golf/satara_night);
ambientCG (Ground037, Ground054, Bark012, Rock030, Moss002); Kenney "Particle Pack", "Splat Pack"; font "EB Garamond"/"Cormorant Garamond" (OFL).

## 7. Prioritet
Fejl 1.1, 1.2, 1.5, 1.4, 1.3 → perf 2.1, 2.2 → lyd 3.1, 3.2 → grafik 4.1, 4.2, 4.9/4.10, 4.11, 4.7, 4.6, 4.4/4.5, 4.3 → oprydning 5.1, 5.2, 5.3, 5.4.
