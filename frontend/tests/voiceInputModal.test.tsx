import React from 'react';
import { render, fireEvent, screen, act, waitFor } from '@testing-library/react-native';
import { VoiceInputModal } from '../components/speech/VoiceInputModal';
import {
  speechRecognitionService,
  MockSpeechAdapter,
} from '../services/speech/speechRecognitionService';

describe('VoiceInputModal Component', () => {
  let mockAdapter: MockSpeechAdapter;

  beforeEach(() => {
    mockAdapter = new MockSpeechAdapter();
    speechRecognitionService.setAdapter(mockAdapter);
  });

  afterEach(() => {
    mockAdapter.abort();
    speechRecognitionService.resetToDefaultAdapter();
  });

  it('renders correctly with title, language selectors, mic button and fallback', () => {
    render(
      <VoiceInputModal
        visible={true}
        onClose={jest.fn()}
        onApply={jest.fn()}
        title="Voice Case Search"
      />
    );

    expect(screen.getByText('Voice Case Search')).toBeTruthy();
    expect(screen.getByTestId('voice-lang-en')).toBeTruthy();
    expect(screen.getByTestId('voice-lang-te')).toBeTruthy();
    expect(screen.getByTestId('voice-lang-hi')).toBeTruthy();
    expect(screen.getByTestId('voice-mic-trigger')).toBeTruthy();
    expect(screen.getByTestId('voice-manual-fallback-button')).toBeTruthy();
    expect(screen.getByTestId('voice-apply-button')).toBeTruthy();
  });

  it('does not render when visible is false', () => {
    render(<VoiceInputModal visible={false} onClose={jest.fn()} onApply={jest.fn()} />);

    expect(screen.queryByTestId('voice-input-modal')).toBeNull();
  });

  it('allows switching recognition language between English, Telugu, and Hindi', () => {
    render(
      <VoiceInputModal
        visible={true}
        onClose={jest.fn()}
        onApply={jest.fn()}
        initialLanguage="en"
      />
    );

    const teButton = screen.getByTestId('voice-lang-te');
    fireEvent.press(teButton);
    expect(teButton.props.accessibilityState.selected).toBe(true);

    const hiButton = screen.getByTestId('voice-lang-hi');
    fireEvent.press(hiButton);
    expect(hiButton.props.accessibilityState.selected).toBe(true);
  });

  it('captures speech, displays transcript, allows manual editing, and submits edited text', async () => {
    mockAdapter.setScenario('success', 'WP 100/2024');

    const onApply = jest.fn();
    const onClose = jest.fn();

    render(<VoiceInputModal visible={true} onClose={onClose} onApply={onApply} />);

    // 1. Press microphone button to start listening
    const micButton = screen.getByTestId('voice-mic-trigger');
    await act(async () => {
      fireEvent.press(micButton);
    });

    // 2. Transcript input displays recognized speech
    await waitFor(() => {
      expect(screen.getByTestId('voice-transcript-input').props.value).toBe(
        'WP 100/2024'
      );
    });
    const transcriptInput = screen.getByTestId('voice-transcript-input');

    // 3. User manually edits recognized text before submission (Requirement 4)
    await act(async () => {
      fireEvent.changeText(transcriptInput, 'WP 100/2024 Adjourned');
    });
    expect(transcriptInput.props.value).toBe('WP 100/2024 Adjourned');

    // 4. Click Apply Search
    const applyButton = screen.getByTestId('voice-apply-button');
    await act(async () => {
      fireEvent.press(applyButton);
    });

    expect(onApply).toHaveBeenCalledWith('WP 100/2024 Adjourned');
    expect(onClose).toHaveBeenCalled();
  });

  it('displays normalized case suggestion and applies it upon clicking suggestion chip', async () => {
    mockAdapter.setScenario('success', 'రిట్ పిటిషన్ ౧౦౧/౨౦౨౪');

    render(
      <VoiceInputModal
        visible={true}
        onClose={jest.fn()}
        onApply={jest.fn()}
        initialLanguage="te"
      />
    );

    const micButton = screen.getByTestId('voice-mic-trigger');
    await act(async () => {
      fireEvent.press(micButton);
    });

    // Suggested normalized query appears: "WP 101/2024"
    const suggestionChip = await waitFor(() =>
      screen.getByTestId('voice-use-normalized')
    );
    expect(suggestionChip).toBeTruthy();
    expect(screen.getByText('WP 101/2024')).toBeTruthy();

    // Tapping suggestion chip replaces transcript with normalized format
    await act(async () => {
      fireEvent.press(suggestionChip);
    });

    const transcriptInput = screen.getByTestId('voice-transcript-input');
    expect(transcriptInput.props.value).toBe('WP 101/2024');
  });

  it('handles permission denial gracefully with clear feedback and manual typing fallback', async () => {
    mockAdapter.setScenario('permission_denied');

    const onClose = jest.fn();

    render(<VoiceInputModal visible={true} onClose={onClose} onApply={jest.fn()} />);

    const micButton = screen.getByTestId('voice-mic-trigger');
    await act(async () => {
      fireEvent.press(micButton);
    });

    // Alert status is shown
    await waitFor(() => {
      expect(screen.getByText('BLOCKED')).toBeTruthy();
    });

    // Fallback to manual typing button is accessible
    const manualBtn = screen.getByTestId('voice-manual-fallback-button');
    fireEvent.press(manualBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it('handles no speech error with informative alert message', async () => {
    mockAdapter.setScenario('no_speech');

    render(<VoiceInputModal visible={true} onClose={jest.fn()} onApply={jest.fn()} />);

    const micButton = screen.getByTestId('voice-mic-trigger');
    await act(async () => {
      fireEvent.press(micButton);
    });

    await waitFor(() => {
      expect(screen.getByText('ALERT')).toBeTruthy();
    });
  });

  it('handles unsupported environment gracefully', async () => {
    mockAdapter.setScenario('not_supported');

    render(<VoiceInputModal visible={true} onClose={jest.fn()} onApply={jest.fn()} />);

    const micButton = screen.getByTestId('voice-mic-trigger');
    await act(async () => {
      fireEvent.press(micButton);
    });

    expect(screen.getByText('ALERT')).toBeTruthy();
  });

  it('clears transcript when clear button is pressed', async () => {
    mockAdapter.setScenario('success', 'WP 500');

    render(<VoiceInputModal visible={true} onClose={jest.fn()} onApply={jest.fn()} />);

    const micButton = screen.getByTestId('voice-mic-trigger');
    await act(async () => {
      fireEvent.press(micButton);
    });

    await waitFor(() => {
      expect(screen.getByTestId('voice-transcript-input').props.value).toBe('WP 500');
    });

    const clearBtn = screen.getByTestId('voice-clear-text');
    await act(async () => {
      fireEvent.press(clearBtn);
    });

    const transcriptInput = screen.getByTestId('voice-transcript-input');
    expect(transcriptInput.props.value).toBe('');
  });
});
