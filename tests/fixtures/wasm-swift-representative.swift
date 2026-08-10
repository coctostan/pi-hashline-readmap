import Foundation

@freestanding(expression)
macro assertPositive(_ value: Int) = #externalMacro(module: "Macros", type: "AssertPositive")

@MainActor
public actor SessionStore {
    @Published private var sessions: [String: Int] = [:]
    @MainActor private var activeCount = 0

    deinit {
        sessions.removeAll()
    }

    public func load(id: String) async throws -> Int {
        return sessions[id] ?? 0
    }

    static func == (lhs: SessionStore, rhs: SessionStore) -> Bool {
        return true
    }

    static func + (lhs: SessionStore, rhs: SessionStore) -> SessionStore {
        return lhs
    }
}

public struct Cache<Key: Hashable, Value>: Sendable where Value: Sendable {
    private var storage: [Key: Value] = [:]

    public func value(for key: Key) -> Value? {
        return storage[key]
    }
}

protocol Renderable {
    associatedtype Output
    func render() -> Output
}

extension Cache where Value: CustomStringConvertible {
    func describeAll() -> [String] {
        return storage.values.map(\.description)
    }
}

@resultBuilder
struct ListBuilder {
    static func buildBlock(_ parts: String...) -> [String] { parts }
}

func makeRenderable() -> some Sendable {
    return 0
}
