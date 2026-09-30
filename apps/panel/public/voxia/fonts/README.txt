XHub font instances

These static WOFF2 files are generated from the bundled Inter, Outfit and
JetBrains Mono variable WOFF2 files in the parent directory. The original
glyph design and Spanish character coverage are preserved. Fixed instances
avoid variable-weight rendering differences observed in the WebKit test runtime.

Weights:
  Inter: 400, 500, 600, 700
  Outfit: 400, 500, 600, 650, 700, 750
  JetBrains Mono: 400, 500, 600

Generated using fontTools 4.66.1 varLib.instancer, pinning the wght axis to
the filename's weight, retaining WOFF2 output and setting OS/2.usWeightClass.
All font-face declarations use normal style and the exact static weight.
Only the weights needed by a page are downloaded by the browser.

The original SIL Open Font Licenses and copyright notices are preserved in:
  ../INTER-LICENSE.txt
  ../OUTFIT-LICENSE.txt
  ../MONO-LICENSE.txt
