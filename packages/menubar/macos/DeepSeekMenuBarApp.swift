import AppKit
import SwiftUI

/// 余额信息
struct BalanceInfo: Codable {
    let currency: String
    let totalBalance: String
    let grantedBalance: String
    let toppedUpBalance: String
}

/// 余额查询结果
struct BalanceResult: Codable {
    let isAvailable: Bool
    let balances: [BalanceInfo]
}

/// 余额状态管理
@MainActor
final class BalanceManager: ObservableObject {
    @Published var balanceText: String = "加载中..."
    @Published var statusText: String = "未知"
    @Published var statusColor: Color = .gray

    private let cliPath: String

    init(cliPath: String) {
        self.cliPath = cliPath
        // 定时刷新（每 10 分钟）
        Timer.scheduledTimer(withTimeInterval: 600, repeats: true) { [weak self] _ in
            self?.fetchBalance()
        }
        // 首次刷新
        fetchBalance()
    }

    /// 调用 deepseek-plugin-cli balance --json 获取余额
    func fetchBalance() {
        let task = Process()
        task.launchPath = "/usr/bin/env"
        task.arguments = [cliPath, "balance", "--json"]

        let pipe = Pipe()
        task.standardOutput = pipe
        task.standardError = Pipe()

        do {
            try task.run()
            task.waitUntilExit()

            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            guard task.terminationStatus == 0, !data.isEmpty else {
                balanceText = "查询失败"
                statusText = "可用状态: 未知"
                statusColor = .gray
                return
            }

            let result = try JSONDecoder().decode(BalanceResult.self, from: data)
            if let main = result.balances.first {
                balanceText = "总额: \(formatBalance(main.totalBalance, currency: main.currency))"
            } else {
                balanceText = "总额: 无数据"
            }
            statusText = "可用状态: \(result.isAvailable ? "✓ 可用" : "⚠ 不可用")"
            statusColor = result.isAvailable ? .green : .red
        } catch {
            balanceText = "查询失败"
            statusText = "可用状态: 未知"
            statusColor = .gray
        }
    }

    /// 格式化余额
    private func formatBalance(_ s: String, currency: String) -> String {
        let n = Double(s) ?? 0
        let symbol = currency == "CNY" ? "¥" : currency == "USD" ? "$" : ""
        if n >= 1000 { return "\(symbol)\(String(format: "%.0f", n))" }
        if n >= 10 { return "\(symbol)\(String(format: "%.1f", n))" }
        return "\(symbol)\(String(format: "%.2f", n))"
    }
}

/// DeepSeek 插件菜单栏应用
/// 用法：DeepSeekMenuBar [cli_path]
/// cli_path 可选，指定 deepseek-plugin-cli 的路径，默认从 PATH 查找
@main
struct DeepSeekMenuBarApp: App {
    /// deepseek-plugin-cli 路径
    let cliPath: String = {
        let args = CommandLine.arguments
        if args.count > 1 {
            return args[1]
        }
        return "deepseek-plugin-cli"
    }()

    @StateObject private var manager: BalanceManager

    init() {
        _manager = StateObject(wrappedValue: BalanceManager(cliPath: {
            let args = CommandLine.arguments
            return args.count > 1 ? args[1] : "deepseek-plugin-cli"
        }()))
    }

    var body: some Scene {
        MenuBarExtra {
            // 第1项：余额，点击跳转 usage
            Button {
                if let url = URL(string: "https://platform.deepseek.com/usage") {
                    NSWorkspace.shared.open(url)
                }
            } label: {
                Text(manager.balanceText)
            }

            // 第2项：可用状态
            Text(manager.statusText)
                .foregroundStyle(manager.statusColor)

            Divider()

            // 第3项：刷新
            Button {
                manager.fetchBalance()
            } label: {
                Label("刷新", systemImage: "arrow.clockwise")
            }
            .keyboardShortcut("r")

            // 第4项：退出
            Button {
                NSApplication.shared.terminate(nil)
            } label: {
                Label("退出", systemImage: "power")
            }
            .keyboardShortcut("q")
        } label: {
            Text("🐳")
        }
    }
}
