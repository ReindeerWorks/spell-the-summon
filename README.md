# Spell the Summon

A children's drag-and-drop spelling game for ages 4+ with a fantasy creature theme — drag scrambled letter tiles into slots to spell each summoned creature's name.

## How to play

Open `index.html` in any browser — no server or build step required.

## Adding images

Place PNG images in `assets/images/`, named exactly as the word in lowercase:

```
assets/images/bat.png
assets/images/cat.png
assets/images/fox.png
... etc.
```

Missing images display a purple placeholder with the word's first letter.

## Adding sounds

Place audio files in `sounds/`:

| File | Triggered when |
|---|---|
| `correct.mp3` | A letter lands in the right slot |
| `wrong.mp3` | A letter is dropped in the wrong slot |
| `levelup.mp3` | A level is completed |

The game works without sound files — Web Speech API handles voice feedback automatically.

## Levels

| Level | Name | Word length |
|---|---|---|
| 1 | Trainee | 3 letters |
| 2 | Hunter | 4 letters |
| 3 | Demon Slayer | 5 letters |
