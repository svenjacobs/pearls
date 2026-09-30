{
  description = "Development shell for pearls";

  # Stable release. Bump to the next one (nixos-YY.MM) every six months.
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";

  outputs =
    { nixpkgs, ... }:
    let
      systems = [
        "aarch64-darwin"
        "x86_64-darwin"
        "aarch64-linux"
        "x86_64-linux"
      ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      # Node.js 26, like CI and the Dockerfile. pnpm switches itself to the exact version in
      # packageManager. Loaded by direnv (.envrc) or `nix develop`.
      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
          packages = [
            pkgs.nodejs_26
            pkgs.pnpm_12
          ];
        };
      });
    };
}
