// swift-tools-version: 5.9
// The package name must be "DontdieGameCenter": `npx cap sync` derives it
// from the npm name (dontdie-game-center) when it wires the plugin in.
import PackageDescription

let package = Package(
    name: "DontdieGameCenter",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "DontdieGameCenter",
            targets: ["GameCenterPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .target(
            name: "GameCenterPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Sources/GameCenterPlugin")
    ]
)
