// frontend/tests/integration/BlockNesting.test.jsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import BlockRenderer from '../../src/modules/editor/core/BlockRenderer';
import LayoutBlock from '../../src/modules/editor/blocks/Layout/LayoutBlock';
import { BlockRendererContext, EditableBlockContext } from '../../src/modules/editor/core/blockComponents';

vi.mock('react-dnd', () => ({
    useDrop: () => [{ isOver: false, canDrop: false }, () => {}],
    useDrag: () => [{ isDragging: false }, () => {}, () => {}],
}));
vi.mock('../../src/modules/editor/blocks/Text/TextBlock', async () => ({ default: (await import('../helpers/stubs')).makeBlockStub('text') }));
vi.mock('../../src/modules/editor/blocks/Hero/HeroBlock', async () => ({ default: (await import('../helpers/stubs')).makeBlockStub('hero') }));
vi.mock('../../src/modules/editor/blocks/Button/ButtonBlock', async () => ({ default: (await import('../helpers/stubs')).makeBlockStub('button') }));
vi.mock('../../src/modules/editor/blocks/Image/ImageBlock', async () => ({ default: (await import('../helpers/stubs')).makeBlockStub('image') }));
vi.mock('../../src/modules/renderer/components/AnimationWrapper', async () => ({ default: (await import('../helpers/stubs')).AnimationStub }));

const leaf = (type, label) => ({ type, block_id: `id-${label}`, data: { __label: label } });
const inner = { type: 'layout', block_id: 'inner', data: { columns: [[leaf('button', 'B1')], [leaf('image', 'I1')]] } };
const outer = { type: 'layout', block_id: 'outer', data: { columns: [[leaf('text', 'T1'), leaf('hero', 'H1')], [inner]] } };

describe('вкладені макети: дочірні блоки рендеряться через контекст', () => {
    it('BlockRenderer показує блоки з усіх колонок, зокрема з вкладеного макета, у порядку розмітки', async () => {
        render(
            <MemoryRouter>
                <BlockRenderer blocks={[outer]} siteData={{}} isEditorPreview={false} />
            </MemoryRouter>
        );
        await waitFor(() => expect(screen.getAllByTestId(/^block-/)).toHaveLength(4), { timeout: 8000 });
        const ids = screen.getAllByTestId(/^block-/).map((element) => element.getAttribute('data-testid'));
        expect(ids).toEqual(['block-text', 'block-hero', 'block-button', 'block-image']);
        screen.getAllByTestId(/^block-/).forEach((element) => expect(element).toHaveAttribute('data-editor-preview', 'false'));
    }, 15000);

    it('макет передає колонкам рендерер із контексту з блоками колонки, даними сайту й ознакою колонки', () => {
        const calls = [];
        const RendererStub = (props) => {
            calls.push(props);
            return <div data-testid="column-renderer" />;
        };
        const siteData = { id: 5 };
        render(
            <BlockRendererContext.Provider value={RendererStub}>
                <LayoutBlock block={outer} siteData={siteData} isEditorPreview={false} path={[0]} />
            </BlockRendererContext.Provider>
        );
        expect(screen.getAllByTestId('column-renderer')).toHaveLength(2);
        expect(calls[0].blocks).toBe(outer.data.columns[0]);
        expect(calls[1].blocks).toBe(outer.data.columns[1]);
        calls.forEach((props) => {
            expect(props.siteData).toBe(siteData);
            expect(props.isEditorPreview).toBe(false);
            expect(props.isLayoutColumn).toBe(true);
        });
    });

    it('у режимі редактора макет показує дочірні блоки обгорткою з контексту й повними шляхами', () => {
        const EditableStub = (props) => <div data-testid="editable" data-id={props.block.block_id} data-path={props.path.join(',')} />;
        render(
            <EditableBlockContext.Provider value={EditableStub}>
                <LayoutBlock block={outer} siteData={{}} isEditorPreview={true} viewMode="editor" path={[3]} />
            </EditableBlockContext.Provider>
        );
        const items = screen.getAllByTestId('editable').map((element) => `${element.getAttribute('data-id')}@${element.getAttribute('data-path')}`);
        expect(items).toEqual(['id-T1@3,data,columns,0,0', 'id-H1@3,data,columns,0,1', 'inner@3,data,columns,1,0']);
    });
});
