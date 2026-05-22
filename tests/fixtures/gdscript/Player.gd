class_name Player
extends Node

signal health_changed(new_value: int)
enum State { IDLE, DAMAGED, DEAD }

const MAX_HEALTH := 100
var health := MAX_HEALTH
var weapon = preload("res://weapons/sword.gd")
var enemy_scene = load("res://enemies/enemy.gd")
var shared_constants = requires("res://shared/constants.gd")

func _ready() -> void:
	health_changed.emit(health)

func take_damage(amount: int) -> void:
	health -= amount
