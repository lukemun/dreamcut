"use client";
import React, { type ComponentType, type ReactNode } from "react";
export type FixtureDefinition = { id: string; width: number; height: number; fps: number; durationInFrames: number; component: ComponentType<any>; defaultProps?: Record<string, unknown> };
const fixtures = new Map<string, FixtureDefinition>();
/** Declarative test cases only; production timelines do not use this registry. */
export function Fixture(_props: FixtureDefinition) { return null; }
export function registerFixtureGroup(root: () => ReactNode) {
  const visit = (node: ReactNode) => React.Children.forEach(node, child => {
    if (!React.isValidElement(child)) return;
    if (child.type === Fixture) {
      const definition = child.props as FixtureDefinition;
      fixtures.set(definition.id, definition);
    } else if (child.type === React.Fragment) visit((child.props as { children: ReactNode }).children);
    else throw new Error("Fixture groups must contain only Fixture declarations");
  });
  visit(root());
}
export function fixtureDefinitions() { return [...fixtures.values()].map(({component: _component, ...definition}) => definition); }
export function getFixture(id: string) {
  const fixture = fixtures.get(id);
  if (!fixture) throw new Error(`Unknown render fixture: ${id}`);
  return fixture;
}
