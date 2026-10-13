{ pkgs ? import <nixpkgs> {} }:
let
  browserLibraries = with pkgs; [
    glib nss nspr atk at-spi2-atk at-spi2-core dbus cups expat
    libxkbcommon alsa-lib mesa cairo pango systemd
    xorg.libX11 xorg.libXext xorg.libXcomposite xorg.libXdamage
    xorg.libXfixes xorg.libXrandr xorg.libxcb
  ] ++ pkgs.lib.optional (pkgs ? libgbm) pkgs.libgbm;
in pkgs.mkShell {
  buildInputs = browserLibraries;
  LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath browserLibraries;
}
